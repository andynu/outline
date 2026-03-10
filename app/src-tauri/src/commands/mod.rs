mod bookmarks;
mod calendar;
mod document;
mod folders;
mod import_export;
mod node;
mod search;
mod settings;
mod watcher_commands;

use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use outline_core::data::{Document, DocumentState, Operation};
use outline_core::search::SearchIndex;

/// Parse a UUID string, returning a descriptive error
pub(crate) fn parse_uuid(id: &str) -> Result<Uuid, String> {
    Uuid::parse_str(id).map_err(|e| format!("Invalid UUID: {}", e))
}

/// State managed by Tauri for the current document
pub struct AppState {
    pub current_document: Mutex<Option<Document>>,
    pub search_index: Mutex<Option<SearchIndex>>,
}

impl AppState {
    pub fn new() -> Self {
        // Initialize search index
        let search_index = SearchIndex::open()
            .map_err(|e| log::error!("Failed to open search index: {}", e))
            .ok();

        Self {
            current_document: Mutex::new(None),
            search_index: Mutex::new(search_index),
        }
    }
}

/// Save an operation to the current document
#[tauri::command]
pub fn save_op(state: State<AppState>, op: Operation) -> Result<DocumentState, String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;

    // Append operation to pending file
    doc.append_op(&op)?;

    // Apply operation to in-memory state
    op.apply(&mut doc.state);

    // Auto-compact if threshold reached (1000 ops or 1MB)
    if doc.should_auto_compact() {
        log::info!("Auto-compacting document...");
        if let Err(e) = doc.compact() {
            log::error!("Auto-compact failed: {}", e);
            // Don't fail the save_op, just log the error
        }
    }

    Ok(doc.state.clone())
}

/// Save multiple operations to the current document in a single batch.
/// All operations are appended and applied with a single lock acquisition,
/// avoiding O(n) IPC round-trips for bulk operations like sibling reordering.
#[tauri::command]
pub fn save_ops(state: State<AppState>, ops: Vec<Operation>) -> Result<DocumentState, String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;

    for op in &ops {
        doc.append_op(op)?;
        op.apply(&mut doc.state);
    }

    // Auto-compact if threshold reached (1000 ops or 1MB)
    if doc.should_auto_compact() {
        log::info!("Auto-compacting document...");
        if let Err(e) = doc.compact() {
            log::error!("Auto-compact failed: {}", e);
        }
    }

    Ok(doc.state.clone())
}

// Re-export all commands for use in lib.rs
pub use bookmarks::*;
pub use calendar::*;
pub use document::*;
pub use folders::*;
pub use import_export::*;
pub use node::*;
pub use search::*;
pub use settings::*;
pub use watcher_commands::*;
