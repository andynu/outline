use tauri::State;

use outline_core::search::{BacklinkResult, SearchResult, UnlinkedReference};

use super::{parse_uuid, AppState};

/// Search for nodes matching a query
#[tauri::command]
pub fn search(
    state: State<AppState>,
    query: String,
    doc_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let doc_uuid = if let Some(id_str) = doc_id {
        Some(parse_uuid(&id_str)?)
    } else {
        None
    };

    let search_index = state.search_index.lock().unwrap();
    let index = search_index
        .as_ref()
        .ok_or("Search index not initialized")?;

    index
        .search(&query, doc_uuid.as_ref(), limit.unwrap_or(50))
        .map_err(|e| format!("Search error: {}", e))
}

/// Get backlinks for a node (items that link to this node)
#[tauri::command]
pub fn get_backlinks(
    state: State<AppState>,
    node_id: String,
) -> Result<Vec<BacklinkResult>, String> {
    let node_uuid = parse_uuid(&node_id)?;

    let search_index = state.search_index.lock().unwrap();
    let index = search_index
        .as_ref()
        .ok_or("Search index not initialized")?;

    index
        .get_backlinks(&node_uuid)
        .map_err(|e| format!("Failed to get backlinks: {}", e))
}

/// Get unlinked references for a node (mentions of its text without formal wiki links)
#[tauri::command]
pub fn get_unlinked_references(
    state: State<AppState>,
    node_id: String,
    search_text: String,
) -> Result<Vec<UnlinkedReference>, String> {
    let node_uuid = parse_uuid(&node_id)?;

    // Skip very short text (too many false positives)
    let text = search_text.trim();
    if text.len() < 3 {
        return Ok(Vec::new());
    }

    let search_index = state.search_index.lock().unwrap();
    let index = search_index
        .as_ref()
        .ok_or("Search index not initialized")?;

    index
        .get_unlinked_references(&node_uuid, text)
        .map_err(|e| format!("Failed to get unlinked references: {}", e))
}
