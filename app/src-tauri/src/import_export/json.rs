use serde::{Deserialize, Serialize};

use crate::data::{DocumentState, Node};

/// JSON backup format - preserves all node data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonBackup {
    /// Format version for future compatibility
    pub version: u32,
    /// Export timestamp
    pub exported_at: String,
    /// All nodes with full metadata
    pub nodes: Vec<Node>,
}

impl JsonBackup {
    pub fn new(nodes: Vec<Node>) -> Self {
        Self {
            version: 1,
            exported_at: chrono::Utc::now().to_rfc3339(),
            nodes,
        }
    }

    pub fn from_state(state: &DocumentState) -> Self {
        Self::new(state.nodes.clone())
    }
}

/// Generate JSON backup from nodes
pub fn generate_json_backup(nodes: &[Node]) -> Result<String, String> {
    let backup = JsonBackup::new(nodes.to_vec());
    serde_json::to_string_pretty(&backup).map_err(|e| format!("JSON serialization error: {}", e))
}

/// Parse JSON backup and return nodes
pub fn parse_json_backup(content: &str) -> Result<Vec<Node>, String> {
    let backup: JsonBackup =
        serde_json::from_str(content).map_err(|e| format!("JSON parse error: {}", e))?;
    Ok(backup.nodes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_backup_roundtrip() {
        let nodes = vec![
            Node::new("First item".to_string()),
            Node::new("Second item".to_string()),
        ];

        let json = generate_json_backup(&nodes).unwrap();
        let parsed = parse_json_backup(&json).unwrap();

        assert_eq!(nodes.len(), parsed.len());
        assert_eq!(nodes[0].content, parsed[0].content);
        assert_eq!(nodes[1].content, parsed[1].content);
    }

    #[test]
    fn test_json_backup_preserves_metadata() {
        let mut node = Node::new("Task".to_string());
        node.note = Some("A note".to_string());
        node.date = Some("2024-01-15".to_string());
        node.is_checked = true;
        node.tags = vec!["important".to_string(), "work".to_string()];

        let nodes = vec![node];
        let json = generate_json_backup(&nodes).unwrap();
        let parsed = parse_json_backup(&json).unwrap();

        let restored = &parsed[0];
        assert_eq!(restored.note, Some("A note".to_string()));
        assert_eq!(restored.date, Some("2024-01-15".to_string()));
        assert!(restored.is_checked);
        assert_eq!(restored.tags, vec!["important".to_string(), "work".to_string()]);
    }
}
