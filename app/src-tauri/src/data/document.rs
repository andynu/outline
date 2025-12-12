use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use uuid::Uuid;

use super::node::Node;
use super::operations::Operation;

/// Document state stored in state.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentState {
    pub nodes: Vec<Node>,
}

impl DocumentState {
    pub fn new() -> Self {
        Self { nodes: Vec::new() }
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
        ops.sort_by_key(|op| op.updated_at());
        for op in ops {
            op.apply(&mut state);
        }

        Ok(Self { id, dir, state })
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

        let doc = Self { id, dir, state };
        doc.save_state()?;

        Ok(doc)
    }

    /// Append an operation to the pending file
    pub fn append_op(&self, op: &Operation) -> Result<(), String> {
        let pending_path = self.pending_path();

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&pending_path)
            .map_err(|e| format!("Open pending file: {}", e))?;

        let json = serde_json::to_string(op).map_err(|e| format!("Serialize op: {}", e))?;
        writeln!(file, "{}", json).map_err(|e| format!("Write op: {}", e))?;

        Ok(())
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
        Ok(())
    }
}

/// Get the data directory path
pub fn data_dir() -> PathBuf {
    // Use ~/.outline-data for now
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".outline-data")
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
