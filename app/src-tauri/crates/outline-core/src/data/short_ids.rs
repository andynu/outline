use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::document::{data_dir, documents_dir, Document};
use super::node::Node;

/// Base36 alphabet for short codes
const BASE36: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

/// Mapping of document prefix -> document UUID
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DocPrefixMap {
    /// prefix -> document UUID string
    pub prefixes: HashMap<String, String>,
}

/// Info about a document for resolution purposes
pub struct DocInfo {
    pub id: Uuid,
    pub prefix: String,
    pub nodes: Vec<Node>,
}

/// Generate a random 4-char base36 code that doesn't collide with existing codes
pub fn generate_short_code(existing: &HashSet<String>) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    // Simple PRNG seeded from time + counter
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;

    loop {
        // xorshift64
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;

        let mut code = String::with_capacity(4);
        let mut val = seed;
        for _ in 0..4 {
            code.push(BASE36[(val % 36) as usize] as char);
            val /= 36;
        }

        if !existing.contains(&code) {
            return code;
        }

        // Increment seed to avoid infinite loops
        seed = seed.wrapping_add(1);
    }
}

/// Derive a document prefix from the title, ensuring uniqueness
pub fn document_prefix(title: &str, existing_prefixes: &[String]) -> String {
    // Strip HTML tags
    let plain = strip_html_simple(title);

    // Take first word, lowercase, truncate to 8 chars, keep only alphanumeric
    let base: String = plain
        .split_whitespace()
        .next()
        .unwrap_or("doc")
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();

    let base = if base.is_empty() { "doc".to_string() } else { base };

    // Ensure uniqueness
    if !existing_prefixes.contains(&base) {
        return base;
    }

    // Append digit to make unique
    for i in 2..=99 {
        let candidate = format!("{}{}", base, i);
        if !existing_prefixes.contains(&candidate) {
            return candidate;
        }
    }

    // Fallback: use first 8 chars of UUID
    format!("d{}", &Uuid::now_v7().to_string()[..7])
}

/// Assign short IDs to all nodes that lack them. Returns true if any were assigned.
pub fn assign_short_ids(nodes: &mut [Node]) -> bool {
    let existing: HashSet<String> = nodes
        .iter()
        .filter_map(|n| n.short_id.clone())
        .collect();

    let mut existing = existing;
    let mut assigned = false;

    for node in nodes.iter_mut() {
        if node.short_id.is_none() {
            let code = generate_short_code(&existing);
            existing.insert(code.clone());
            node.short_id = Some(code);
            assigned = true;
        }
    }

    assigned
}

/// Get the doc_prefixes.json path
fn prefixes_path() -> PathBuf {
    data_dir().join("doc_prefixes.json")
}

/// Load document prefix mapping from disk
pub fn load_prefix_map() -> DocPrefixMap {
    let path = prefixes_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(map) = serde_json::from_str(&content) {
                return map;
            }
        }
    }
    DocPrefixMap::default()
}

/// Save document prefix mapping to disk
pub fn save_prefix_map(map: &DocPrefixMap) -> Result<(), String> {
    let path = prefixes_path();
    let content = serde_json::to_string_pretty(map)
        .map_err(|e| format!("Serialize prefix map: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Write prefix map: {}", e))?;
    Ok(())
}

/// Get or create a prefix for a document, updating the map if needed
pub fn get_or_create_prefix(doc_id: &Uuid, title: &str, map: &mut DocPrefixMap) -> String {
    let doc_id_str = doc_id.to_string();

    // Check if this document already has a prefix
    for (prefix, id) in &map.prefixes {
        if *id == doc_id_str {
            return prefix.clone();
        }
    }

    // Generate new prefix
    let existing: Vec<String> = map.prefixes.keys().cloned().collect();
    let prefix = document_prefix(title, &existing);
    map.prefixes.insert(prefix.clone(), doc_id_str);
    prefix
}

/// Resolve a short ID string to (document UUID, node UUID)
///
/// Format: "prefix-code" for cross-document, or "code" for within active document
pub fn resolve_short_id(
    input: &str,
    active_doc_id: Option<&Uuid>,
) -> Result<(Uuid, Uuid), String> {
    let map = load_prefix_map();

    if let Some(hyphen_pos) = input.rfind('-') {
        // prefix-code format
        let prefix = &input[..hyphen_pos];
        let code = &input[hyphen_pos + 1..];

        let doc_id_str = map.prefixes.get(prefix)
            .ok_or_else(|| format!("Unknown document prefix: '{}'. Run 'outline doc list' to see prefixes.", prefix))?;

        let doc_uuid = Uuid::parse_str(doc_id_str)
            .map_err(|e| format!("Invalid UUID in prefix map: {}", e))?;

        let doc_dir = documents_dir().join(doc_id_str);
        let doc = Document::load(doc_dir)?;

        let node = doc.state.nodes.iter()
            .find(|n| n.short_id.as_deref() == Some(code))
            .ok_or_else(|| format!("Node with short ID '{}' not found in document '{}'", code, prefix))?;

        Ok((doc_uuid, node.id))
    } else if input.len() == 4 && input.chars().all(|c| c.is_ascii_alphanumeric()) {
        // Bare code — search in active document
        let doc_uuid = active_doc_id
            .ok_or_else(|| "Bare short ID requires --doc flag or a document prefix (e.g. 'work-a3f2')".to_string())?;

        let doc_dir = documents_dir().join(doc_uuid.to_string());
        let doc = Document::load(doc_dir)?;

        let node = doc.state.nodes.iter()
            .find(|n| n.short_id.as_deref() == Some(input))
            .ok_or_else(|| format!("Node with short ID '{}' not found in active document", input))?;

        Ok((*doc_uuid, node.id))
    } else {
        // Try as UUID
        let uuid = Uuid::parse_str(input)
            .map_err(|_| format!("'{}' is not a valid short ID (prefix-code), bare code, or UUID", input))?;
        // For UUID, we need the doc context
        let doc_uuid = active_doc_id
            .ok_or_else(|| "UUID node IDs require --doc flag".to_string())?;
        Ok((*doc_uuid, uuid))
    }
}

/// Ensure a document has short IDs assigned to all its nodes and has a prefix.
/// Saves state.json if short IDs were assigned.
pub fn ensure_short_ids(doc: &mut Document) -> Result<String, String> {
    // Assign short IDs to any nodes missing them
    let assigned = assign_short_ids(&mut doc.state.nodes);
    if assigned {
        doc.save_state()?;
    }

    // Get document title from first root node
    let title = doc.state.nodes.iter()
        .find(|n| n.parent_id.is_none())
        .map(|n| strip_html_simple(&n.content))
        .unwrap_or_else(|| "doc".to_string());

    // Ensure prefix exists
    let mut map = load_prefix_map();
    let prefix = get_or_create_prefix(&doc.id, &title, &mut map);
    save_prefix_map(&map)?;

    Ok(prefix)
}

/// Simple HTML tag stripper
fn strip_html_simple(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_short_code() {
        let existing = HashSet::new();
        let code = generate_short_code(&existing);
        assert_eq!(code.len(), 4);
        assert!(code.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn test_generate_short_code_avoids_collisions() {
        let mut existing = HashSet::new();
        // Generate 100 codes, all should be unique
        for _ in 0..100 {
            let code = generate_short_code(&existing);
            assert!(!existing.contains(&code));
            existing.insert(code);
        }
        assert_eq!(existing.len(), 100);
    }

    #[test]
    fn test_document_prefix() {
        let prefix = document_prefix("My Work Notes", &[]);
        assert_eq!(prefix, "my");

        let prefix = document_prefix("My Work Notes", &["my".to_string()]);
        assert_eq!(prefix, "my2");

        let prefix = document_prefix("<b>Bold Title</b>", &[]);
        assert_eq!(prefix, "bold");
    }

    #[test]
    fn test_document_prefix_with_special_chars() {
        let prefix = document_prefix("!!kb", &[]);
        assert_eq!(prefix, "kb");

        let prefix = document_prefix("", &[]);
        assert_eq!(prefix, "doc");
    }

    #[test]
    fn test_assign_short_ids() {
        let mut nodes = vec![
            Node::new("First".to_string()),
            Node::new("Second".to_string()),
        ];

        assert!(nodes[0].short_id.is_none());
        assert!(nodes[1].short_id.is_none());

        let assigned = assign_short_ids(&mut nodes);
        assert!(assigned);
        assert!(nodes[0].short_id.is_some());
        assert!(nodes[1].short_id.is_some());
        assert_ne!(nodes[0].short_id, nodes[1].short_id);

        // Second call should not assign new ones
        let assigned2 = assign_short_ids(&mut nodes);
        assert!(!assigned2);
    }
}
