use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::RwLock;
use uuid::Uuid;

use super::node::Node;
use super::operations::Operation;

/// Global config for data directory (can be changed at runtime)
static DATA_DIR_OVERRIDE: RwLock<Option<PathBuf>> = RwLock::new(None);

/// Document state stored in state.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentState {
    pub nodes: Vec<Node>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub doc_prefix: Option<String>,
}

impl DocumentState {
    pub fn new() -> Self {
        Self { nodes: Vec::new(), doc_prefix: None }
    }

    /// Build a HashMap for quick node lookup by ID
    #[allow(dead_code)]
    pub fn nodes_by_id(&self) -> HashMap<Uuid, &Node> {
        self.nodes.iter().map(|n| (n.id, n)).collect()
    }

    /// Build a mutable HashMap for node lookup
    #[allow(dead_code)]
    pub fn nodes_by_id_mut(&mut self) -> HashMap<Uuid, &mut Node> {
        self.nodes.iter_mut().map(|n| (n.id, n)).collect()
    }
}

impl Default for DocumentState {
    fn default() -> Self {
        Self::new()
    }
}

/// Manages a single document's files (state.json + pending.*.jsonl)
pub struct Document {
    /// Document UUID
    #[allow(dead_code)]
    pub id: Uuid,
    /// Path to document directory
    pub dir: PathBuf,
    /// Current state (after loading and applying pending ops)
    pub state: DocumentState,
    /// Timestamp of last load (for change detection)
    pub last_load_time: std::time::SystemTime,
    /// Count of pending operations since last compact (for auto-compact threshold)
    pub pending_op_count: usize,
}

impl Document {
    /// Get the state.json path
    fn state_path(&self) -> PathBuf {
        self.dir.join("state.json")
    }

    /// Get the pending.{hostname}.jsonl path
    fn pending_path(&self) -> PathBuf {
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "unknown".to_string());
        self.dir.join(format!("pending.{}.jsonl", hostname))
    }

    /// Load document from directory, applying any pending operations
    pub fn load(dir: PathBuf) -> Result<Self, String> {
        let id = dir
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|s| Uuid::parse_str(s).ok())
            .ok_or_else(|| format!("Invalid document directory name: {:?}", dir))?;

        // Load base state
        let state_path = dir.join("state.json");
        let mut state = if state_path.exists() {
            let contents =
                fs::read_to_string(&state_path).map_err(|e| format!("Read state.json: {}", e))?;
            serde_json::from_str(&contents).map_err(|e| format!("Parse state.json: {}", e))?
        } else {
            DocumentState::new()
        };

        // Collect all pending.*.jsonl files
        let mut ops: Vec<Operation> = Vec::new();
        if dir.exists() {
            for entry in fs::read_dir(&dir).map_err(|e| format!("Read dir: {}", e))? {
                let entry = entry.map_err(|e| format!("Read dir entry: {}", e))?;
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("pending.") && name.ends_with(".jsonl") {
                        let file =
                            File::open(&path).map_err(|e| format!("Open {}: {}", name, e))?;
                        let reader = BufReader::new(file);
                        for line in reader.lines() {
                            let line = line.map_err(|e| format!("Read line: {}", e))?;
                            if !line.trim().is_empty() {
                                let op: Operation = serde_json::from_str(&line)
                                    .map_err(|e| format!("Parse op: {} in {}", e, line))?;
                                ops.push(op);
                            }
                        }
                    }
                }
            }
        }

        // Sort ops by timestamp and apply
        let pending_op_count = ops.len();
        ops.sort_by_key(|op| op.updated_at());
        for op in ops {
            op.apply(&mut state);
        }

        Ok(Self {
            id,
            dir,
            state,
            last_load_time: std::time::SystemTime::now(),
            pending_op_count,
        })
    }

    /// Create a new empty document
    pub fn create(dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&dir).map_err(|e| format!("Create dir: {}", e))?;

        let id = dir
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|s| Uuid::parse_str(s).ok())
            .ok_or_else(|| format!("Invalid document directory name: {:?}", dir))?;

        let state = DocumentState::new();

        let doc = Self {
            id,
            dir,
            state,
            last_load_time: std::time::SystemTime::now(),
            pending_op_count: 0,
        };
        doc.save_state()?;

        Ok(doc)
    }

    /// Append an operation to the pending file
    pub fn append_op(&mut self, op: &Operation) -> Result<(), String> {
        let pending_path = self.pending_path();
        log::info!("append_op: writing to {:?}", pending_path);

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&pending_path)
            .map_err(|e| format!("Open pending file {:?}: {}", pending_path, e))?;

        let json = serde_json::to_string(op).map_err(|e| format!("Serialize op: {}", e))?;
        writeln!(file, "{}", json).map_err(|e| format!("Write op: {}", e))?;
        file.flush().map_err(|e| format!("Flush pending file: {}", e))?;

        self.pending_op_count += 1;
        log::info!("append_op: wrote {} bytes (pending ops: {})", json.len(), self.pending_op_count);
        Ok(())
    }

    /// Check if auto-compaction should be triggered
    /// Threshold: 1000 operations or 1MB pending file size
    pub fn should_auto_compact(&self) -> bool {
        // Check op count threshold (1000 ops)
        if self.pending_op_count >= 1000 {
            log::info!("Auto-compact threshold reached: {} ops", self.pending_op_count);
            return true;
        }

        // Check file size threshold (1MB)
        let pending_path = self.pending_path();
        if let Ok(meta) = fs::metadata(&pending_path) {
            let size = meta.len();
            if size >= 1_000_000 {
                log::info!("Auto-compact threshold reached: {} bytes", size);
                return true;
            }
        }

        false
    }

    /// Save the current state to state.json
    pub fn save_state(&self) -> Result<(), String> {
        let state_path = self.state_path();

        let json =
            serde_json::to_string_pretty(&self.state).map_err(|e| format!("Serialize: {}", e))?;
        fs::write(&state_path, json).map_err(|e| format!("Write state.json: {}", e))?;

        Ok(())
    }

    /// Clear all pending files (after successful merge)
    pub fn clear_pending(&self) -> Result<(), String> {
        if !self.dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(&self.dir).map_err(|e| format!("Read dir: {}", e))? {
            let entry = entry.map_err(|e| format!("Read dir entry: {}", e))?;
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("pending.") && name.ends_with(".jsonl") {
                    fs::remove_file(&path).map_err(|e| format!("Remove {}: {}", name, e))?;
                }
            }
        }

        Ok(())
    }

    /// Compact: merge all pending into state.json, clear pending files
    pub fn compact(&mut self) -> Result<(), String> {
        // State is already up-to-date from load(), just save and clear
        self.save_state()?;
        self.clear_pending()?;
        self.pending_op_count = 0;
        self.last_load_time = std::time::SystemTime::now();
        log::info!("Compacted document, reset pending op count to 0");
        Ok(())
    }

    /// Check if any document files have been modified since last load
    pub fn has_external_changes(&self) -> bool {
        // Check state.json
        let state_path = self.state_path();
        if let Ok(meta) = fs::metadata(&state_path) {
            if let Ok(modified) = meta.modified() {
                if modified > self.last_load_time {
                    return true;
                }
            }
        }

        // Check all pending files (not just ours - other machines may have synced)
        if let Ok(entries) = fs::read_dir(&self.dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("pending.") && name.ends_with(".jsonl") {
                        if let Ok(meta) = fs::metadata(&path) {
                            if let Ok(modified) = meta.modified() {
                                if modified > self.last_load_time {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }

        false
    }

    /// Reload document from disk, updating state
    pub fn reload(&mut self) -> Result<(), String> {
        let new_doc = Document::load(self.dir.clone())?;
        self.state = new_doc.state;
        self.pending_op_count = new_doc.pending_op_count;
        self.last_load_time = std::time::SystemTime::now();
        Ok(())
    }
}

/// Get the default data directory path
pub fn default_data_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".outline-data")
}

/// Get the data directory path (uses override if set, otherwise default)
pub fn data_dir() -> PathBuf {
    if let Ok(guard) = DATA_DIR_OVERRIDE.read() {
        if let Some(ref path) = *guard {
            return path.clone();
        }
    }
    default_data_dir()
}

/// Shared mutex for tests that use DATA_DIR_OVERRIDE.
/// All test modules (bookmarks, folders, etc.) must lock this to prevent cross-module interference.
#[cfg(test)]
pub static TEST_DATA_DIR_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Set the data directory override
pub fn set_data_dir(path: Option<PathBuf>) {
    if let Ok(mut guard) = DATA_DIR_OVERRIDE.write() {
        *guard = path;
    }
}

/// Get the config file path (stored in user's config directory)
fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("outline")
        .join("config.json")
}

/// A named capture target — a specific document + node location for quick capture
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureTarget {
    pub document_id: String,
    pub node_id: String,
    #[serde(default)]
    pub default: bool,
}

/// App configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_directory: Option<String>,
    /// Named capture targets
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub capture_targets: HashMap<String, CaptureTarget>,
}

/// Load app configuration from disk
pub fn load_config() -> AppConfig {
    let path = config_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                return config;
            }
        }
    }
    AppConfig::default()
}

/// Save app configuration to disk
pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create config dir: {}", e))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Serialize config: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Write config: {}", e))?;
    Ok(())
}

/// Initialize data directory from config (call at startup)
pub fn init_data_dir_from_config() {
    let config = load_config();
    if let Some(ref path_str) = config.data_directory {
        let path = PathBuf::from(path_str);
        if path.exists() || path_str.is_empty() {
            set_data_dir(if path_str.is_empty() { None } else { Some(path) });
        }
    }
}

// -- Capture target management --

/// Get all capture targets
pub fn get_capture_targets() -> HashMap<String, CaptureTarget> {
    load_config().capture_targets
}

/// Get a capture target by name (or default if name is None)
pub fn get_capture_target(name: Option<&str>) -> Option<(String, CaptureTarget)> {
    let config = load_config();
    match name {
        Some(n) => config.capture_targets.get(n).map(|t| (n.to_string(), t.clone())),
        None => {
            // Find default target
            config.capture_targets.iter()
                .find(|(_, t)| t.default)
                .map(|(n, t)| (n.clone(), t.clone()))
        }
    }
}

/// Add or update a capture target
pub fn set_capture_target(name: &str, document_id: String, node_id: String) -> Result<CaptureTarget, String> {
    let mut config = load_config();

    // If this is the first target, make it default
    let is_first = config.capture_targets.is_empty();

    let target = CaptureTarget {
        document_id,
        node_id,
        default: is_first,
    };

    config.capture_targets.insert(name.to_string(), target.clone());
    save_config(&config)?;
    Ok(target)
}

/// Remove a capture target
pub fn remove_capture_target(name: &str) -> Result<(), String> {
    let mut config = load_config();

    let was_default = config.capture_targets.get(name).map(|t| t.default).unwrap_or(false);
    config.capture_targets.remove(name);

    // If we removed the default, assign default to first remaining target
    if was_default {
        if let Some(target) = config.capture_targets.values_mut().next() {
            target.default = true;
        }
    }

    save_config(&config)
}

/// Set which capture target is the default
pub fn set_default_capture_target(name: &str) -> Result<(), String> {
    let mut config = load_config();

    if !config.capture_targets.contains_key(name) {
        return Err(format!("Capture target '{}' not found", name));
    }

    for (n, target) in config.capture_targets.iter_mut() {
        target.default = n == name;
    }

    save_config(&config)
}

/// Get the documents directory path
pub fn documents_dir() -> PathBuf {
    data_dir().join("documents")
}

/// Ensure the data directories exist
pub fn ensure_dirs() -> Result<(), String> {
    let docs_dir = documents_dir();
    fs::create_dir_all(&docs_dir).map_err(|e| format!("Create data dirs: {}", e))?;
    Ok(())
}

/// List all document IDs
#[allow(dead_code)]
pub fn list_documents() -> Result<Vec<Uuid>, String> {
    let docs_dir = documents_dir();
    let mut ids = Vec::new();

    if !docs_dir.exists() {
        return Ok(ids);
    }

    for entry in fs::read_dir(&docs_dir).map_err(|e| format!("Read documents dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Read entry: {}", e))?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if let Ok(id) = Uuid::parse_str(name) {
                    ids.push(id);
                }
            }
        }
    }

    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{create_op, update_op, NodeChanges};
    use std::fs;
    use tempfile::TempDir;

    fn test_doc_dir() -> (TempDir, PathBuf) {
        let tmp = TempDir::new().unwrap();
        let doc_id = Uuid::new_v4();
        let doc_dir = tmp.path().join(doc_id.to_string());
        fs::create_dir_all(&doc_dir).unwrap();
        (tmp, doc_dir)
    }

    #[test]
    fn test_create_and_load_document() {
        let (_tmp, doc_dir) = test_doc_dir();

        // Create empty document
        let doc = Document::create(doc_dir.clone()).unwrap();
        assert!(doc.state.nodes.is_empty());

        // Reload it
        let doc2 = Document::load(doc_dir).unwrap();
        assert!(doc2.state.nodes.is_empty());
    }

    #[test]
    fn test_operations_and_reload() {
        let (_tmp, doc_dir) = test_doc_dir();

        // Create document
        let mut doc = Document::create(doc_dir.clone()).unwrap();

        // Add a node via operation
        let op1 = create_op(None, 0, "First node".to_string());
        let node_id = match &op1 {
            crate::data::Operation::Create { id, .. } => *id,
            _ => unreachable!(),
        };
        doc.append_op(&op1).unwrap();
        op1.apply(&mut doc.state);

        assert_eq!(doc.state.nodes.len(), 1);
        assert_eq!(doc.state.nodes[0].content, "First node");

        // Update the node
        let op2 = update_op(
            node_id,
            NodeChanges {
                content: Some("Updated content".to_string()),
                ..Default::default()
            },
        );
        doc.append_op(&op2).unwrap();
        op2.apply(&mut doc.state);

        // Reload from disk (should replay pending ops)
        let doc2 = Document::load(doc_dir.clone()).unwrap();
        assert_eq!(doc2.state.nodes.len(), 1);
        assert_eq!(doc2.state.nodes[0].content, "Updated content");

        // Compact and reload
        let mut doc3 = Document::load(doc_dir.clone()).unwrap();
        doc3.compact().unwrap();

        let doc4 = Document::load(doc_dir).unwrap();
        assert_eq!(doc4.state.nodes.len(), 1);
        assert_eq!(doc4.state.nodes[0].content, "Updated content");
    }

    #[test]
    fn test_multi_machine_pending_files() {
        let (_tmp, doc_dir) = test_doc_dir();

        // Create document
        let doc = Document::create(doc_dir.clone()).unwrap();
        doc.save_state().unwrap();

        // Simulate operations from two machines by writing pending files directly
        let op1 = create_op(None, 0, "From machine A".to_string());
        let op2 = create_op(None, 1, "From machine B".to_string());

        // Write to different pending files
        let pending_a = doc_dir.join("pending.machine-a.jsonl");
        let pending_b = doc_dir.join("pending.machine-b.jsonl");

        fs::write(&pending_a, serde_json::to_string(&op1).unwrap() + "\n").unwrap();
        fs::write(&pending_b, serde_json::to_string(&op2).unwrap() + "\n").unwrap();

        // Load should merge both
        let doc2 = Document::load(doc_dir).unwrap();
        assert_eq!(doc2.state.nodes.len(), 2);
    }
}
