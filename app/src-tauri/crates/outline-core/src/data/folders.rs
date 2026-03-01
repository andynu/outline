use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::PathBuf;
use uuid::Uuid;

use super::document::data_dir;

/// Folder structure for organizing documents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub position: i32,
    pub collapsed: bool,
}

/// Folder assignment: maps document_id -> folder_id (or null for root level)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FolderState {
    /// Ordered list of folders
    pub folders: Vec<Folder>,
    /// Maps document_id -> folder_id (documents not in map are at root level)
    pub document_folders: HashMap<String, String>,
    /// Order of documents within each folder (folder_id -> [doc_id, ...])
    /// Special key "__root__" for documents at root level
    pub document_order: HashMap<String, Vec<String>>,
}

impl FolderState {
    pub fn new() -> Self {
        Self {
            folders: Vec::new(),
            document_folders: HashMap::new(),
            document_order: HashMap::new(),
        }
    }

    /// Get the folder_id for a document, or None if at root level
    #[allow(dead_code)]
    pub fn get_folder_for_document(&self, doc_id: &str) -> Option<&String> {
        self.document_folders.get(doc_id)
    }
}

/// Get the folders.json path
pub fn folders_path() -> PathBuf {
    data_dir().join("folders.json")
}

/// Load folder state from disk
pub fn load_folders() -> Result<FolderState, String> {
    let path = folders_path();
    if !path.exists() {
        return Ok(FolderState::new());
    }

    let file = File::open(&path).map_err(|e| format!("Open folders.json: {}", e))?;
    let reader = BufReader::new(file);
    serde_json::from_reader(reader).map_err(|e| format!("Parse folders.json: {}", e))
}

/// Save folder state to disk
pub fn save_folders(state: &FolderState) -> Result<(), String> {
    let path = folders_path();
    let file = File::create(&path).map_err(|e| format!("Create folders.json: {}", e))?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, state).map_err(|e| format!("Write folders.json: {}", e))
}

/// Create a new folder
pub fn create_folder(name: &str) -> Result<Folder, String> {
    let mut state = load_folders()?;

    // Calculate next position
    let position = state.folders.iter().map(|f| f.position).max().unwrap_or(-1) + 1;

    let folder = Folder {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        position,
        collapsed: false,
    };

    state.folders.push(folder.clone());
    save_folders(&state)?;

    Ok(folder)
}

/// Get an existing folder by name, or create it if it doesn't exist
pub fn get_or_create_folder(name: &str) -> Result<Folder, String> {
    let state = load_folders()?;

    // Check if folder with this name already exists
    if let Some(existing) = state.folders.iter().find(|f| f.name == name) {
        return Ok(existing.clone());
    }

    // Create new folder
    create_folder(name)
}

/// Update a folder's properties
pub fn update_folder(id: &str, name: Option<&str>, collapsed: Option<bool>) -> Result<Folder, String> {
    let mut state = load_folders()?;

    let folder = state.folders.iter_mut().find(|f| f.id == id)
        .ok_or_else(|| format!("Folder not found: {}", id))?;

    if let Some(n) = name {
        folder.name = n.to_string();
    }
    if let Some(c) = collapsed {
        folder.collapsed = c;
    }

    let result = folder.clone();
    save_folders(&state)?;

    Ok(result)
}

/// Delete a folder (moves documents to root level)
pub fn delete_folder(id: &str) -> Result<(), String> {
    let mut state = load_folders()?;

    // Remove folder from list
    state.folders.retain(|f| f.id != id);

    // Move documents from this folder to root level
    let docs_in_folder: Vec<String> = state.document_folders.iter()
        .filter(|(_, folder_id)| *folder_id == id)
        .map(|(doc_id, _)| doc_id.clone())
        .collect();

    for doc_id in &docs_in_folder {
        state.document_folders.remove(doc_id);
    }

    // Clean up document_order
    state.document_order.remove(id);

    // Add documents to root level order
    let root_order = state.document_order.entry("__root__".to_string()).or_default();
    root_order.extend(docs_in_folder);

    save_folders(&state)?;
    Ok(())
}

/// Move a document to a folder (or root level if folder_id is None)
pub fn move_document_to_folder(doc_id: &str, folder_id: Option<&str>, position: Option<i32>) -> Result<(), String> {
    let mut state = load_folders()?;

    // Remove document from old location
    let old_folder = state.document_folders.remove(doc_id);
    let old_folder_key = old_folder.as_deref().unwrap_or("__root__");
    if let Some(order) = state.document_order.get_mut(old_folder_key) {
        order.retain(|d| d != doc_id);
    }

    // Add document to new location
    let new_folder_key = folder_id.unwrap_or("__root__");
    if let Some(fid) = folder_id {
        state.document_folders.insert(doc_id.to_string(), fid.to_string());
    }

    // Update document order
    let order = state.document_order.entry(new_folder_key.to_string()).or_default();
    if let Some(pos) = position {
        let idx = (pos as usize).min(order.len());
        order.insert(idx, doc_id.to_string());
    } else {
        order.push(doc_id.to_string());
    }

    save_folders(&state)?;
    Ok(())
}

/// Reorder folders
pub fn reorder_folders(folder_ids: Vec<String>) -> Result<(), String> {
    let mut state = load_folders()?;

    // Update positions based on new order
    for (i, folder_id) in folder_ids.iter().enumerate() {
        if let Some(folder) = state.folders.iter_mut().find(|f| f.id == *folder_id) {
            folder.position = i as i32;
        }
    }

    // Sort folders by new position
    state.folders.sort_by_key(|f| f.position);

    save_folders(&state)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::sync::Mutex;
    use tempfile::TempDir;

    // Mutex to ensure tests run serially (they share global state via env var)
    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    fn setup_test_data_dir() -> TempDir {
        let tmp = TempDir::new().unwrap();
        // Override the data directory for testing
        env::set_var("OUTLINE_DATA_DIR", tmp.path());
        tmp
    }

    #[test]
    fn test_folder_collapsed_state_persistence() {
        let _lock = TEST_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        // Create a folder
        let folder = create_folder("Test Folder").expect("Should create folder");
        assert!(!folder.collapsed, "New folder should not be collapsed");

        // Collapse the folder
        let updated = update_folder(&folder.id, None, Some(true)).expect("Should update folder");
        assert!(updated.collapsed, "Folder should be collapsed after update");

        // Reload folders from disk
        let state = load_folders().expect("Should load folders");
        let loaded_folder = state.folders.iter().find(|f| f.id == folder.id)
            .expect("Should find folder");
        assert!(loaded_folder.collapsed, "Collapsed state should be persisted");
    }

    #[test]
    fn test_folder_collapsed_state_toggle() {
        let _lock = TEST_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        // Create and collapse a folder
        let folder = create_folder("Toggle Test").expect("Should create folder");
        update_folder(&folder.id, None, Some(true)).expect("Should collapse folder");

        // Verify collapsed
        let state1 = load_folders().expect("Should load folders");
        let folder1 = state1.folders.iter().find(|f| f.id == folder.id)
            .expect("Should find folder");
        assert!(folder1.collapsed, "Should be collapsed");

        // Expand the folder
        update_folder(&folder.id, None, Some(false)).expect("Should expand folder");

        // Verify expanded
        let state2 = load_folders().expect("Should load folders");
        let folder2 = state2.folders.iter().find(|f| f.id == folder.id)
            .expect("Should find folder");
        assert!(!folder2.collapsed, "Should be expanded");
    }
}
