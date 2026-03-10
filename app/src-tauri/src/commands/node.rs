use tauri::State;
use uuid::Uuid;

use outline_core::data::{
    create_op, create_op_with_id, delete_op, documents_dir, move_op, update_op,
    Document, DocumentState, NodeChanges, NodeType, Operation,
};

use super::{parse_uuid, save_op, AppState};

/// Create a new node (convenience command that wraps save_op)
#[tauri::command]
pub fn create_node(
    state: State<AppState>,
    parent_id: Option<String>,
    position: i32,
    content: String,
) -> Result<(Uuid, DocumentState), String> {
    let parent_uuid = if let Some(id_str) = parent_id {
        Some(parse_uuid(&id_str)?)
    } else {
        None
    };

    let op = create_op(parent_uuid, position, content);
    let new_id = match &op {
        Operation::Create { id, .. } => *id,
        _ => unreachable!(),
    };

    let new_state = save_op(state, op)?;
    Ok((new_id, new_state))
}

/// Create a node with a specific ID (for undo/redo)
#[tauri::command]
pub fn create_node_with_id(
    state: State<AppState>,
    id: String,
    parent_id: Option<String>,
    position: i32,
    content: String,
    node_type: NodeType,
) -> Result<(Uuid, DocumentState), String> {
    let node_id = parse_uuid(&id)?;
    let parent_uuid = if let Some(id_str) = parent_id {
        Some(parse_uuid(&id_str)?)
    } else {
        None
    };

    let op = create_op_with_id(node_id, parent_uuid, position, content, node_type);

    let new_state = save_op(state, op)?;
    Ok((node_id, new_state))
}

/// Update a node (convenience command that wraps save_op)
#[tauri::command]
pub fn update_node(
    state: State<AppState>,
    id: String,
    changes: NodeChanges,
) -> Result<DocumentState, String> {
    let node_id = parse_uuid(&id)?;
    let op = update_op(node_id, changes);
    save_op(state, op)
}

/// Update a node in a specific document (for cross-document operations like Today panel check-off).
/// If the target document is the currently loaded one, delegates to save_op and returns the
/// updated DocumentState so the frontend can refresh its view.
/// Otherwise loads the document, applies the operation, saves directly, and returns None.
#[tauri::command]
pub fn update_node_in_document(
    state: State<AppState>,
    node_id: String,
    document_id: String,
    changes: NodeChanges,
) -> Result<Option<DocumentState>, String> {
    let node_uuid = parse_uuid(&node_id)?;
    let doc_uuid = parse_uuid(&document_id)?;

    // Check if this is the currently loaded document
    let is_current = {
        let current = state.current_document.lock().unwrap();
        current.as_ref().map_or(false, |doc| doc.id == doc_uuid)
    };

    if is_current {
        let op = update_op(node_uuid, changes);
        let doc_state = save_op(state, op)?;
        return Ok(Some(doc_state));
    }

    // Load the target document, apply changes, save
    let doc_dir = documents_dir().join(doc_uuid.to_string());
    let mut doc = Document::load(doc_dir)?;

    let op = update_op(node_uuid, changes);
    doc.append_op(&op)?;
    op.apply(&mut doc.state);

    // Re-index the modified node for search
    if let Ok(search_index) = state.search_index.lock() {
        if let Some(ref index) = *search_index {
            if let Some(updated_node) = doc.state.nodes.iter().find(|n| n.id == node_uuid) {
                let _ = index.update_node(&doc_uuid, updated_node);
            }
        }
    }

    Ok(None)
}

/// Move a node (convenience command that wraps save_op)
#[tauri::command]
pub fn move_node(
    state: State<AppState>,
    id: String,
    parent_id: Option<String>,
    position: i32,
) -> Result<DocumentState, String> {
    let node_id = parse_uuid(&id)?;
    let parent_uuid = if let Some(id_str) = parent_id {
        Some(parse_uuid(&id_str)?)
    } else {
        None
    };

    let op = move_op(node_id, parent_uuid, position);
    save_op(state, op)
}

/// Delete a node (convenience command that wraps save_op)
#[tauri::command]
pub fn delete_node(state: State<AppState>, id: String) -> Result<DocumentState, String> {
    let node_id = parse_uuid(&id)?;
    let op = delete_op(node_id);
    save_op(state, op)
}

/// Convert a plain text mention to a wiki link in the source node
#[tauri::command]
pub fn convert_mention_to_link(
    state: State<AppState>,
    source_node_id: String,
    source_document_id: String,
    target_node_id: String,
    mention_text: String,
) -> Result<(), String> {
    let source_uuid = parse_uuid(&source_node_id)?;
    let source_doc_uuid = parse_uuid(&source_document_id)?;
    let target_uuid = parse_uuid(&target_node_id)?;

    // Load the source document
    let doc_dir = documents_dir().join(source_doc_uuid.to_string());
    let mut doc = Document::load(doc_dir)?;

    // Find the source node
    let node = doc.state.nodes.iter()
        .find(|n| n.id == source_uuid)
        .ok_or("Source node not found")?;

    // Build the wiki link HTML
    let wiki_link_html = format!(
        r#"<span data-wiki-link="" class="wiki-link" data-node-id="{}">{}</span>"#,
        target_uuid, mention_text
    );

    // Replace the first case-insensitive match in the content
    let content = &node.content;
    let new_content = if let Some(pos) = content.to_lowercase().find(&mention_text.to_lowercase()) {
        let mut result = String::with_capacity(content.len() + wiki_link_html.len());
        result.push_str(&content[..pos]);
        result.push_str(&wiki_link_html);
        result.push_str(&content[pos + mention_text.len()..]);
        result
    } else {
        return Err("Mention text not found in source node".to_string());
    };

    // Create an update operation
    let op = update_op(source_uuid, NodeChanges {
        content: Some(new_content),
        ..Default::default()
    });

    doc.append_op(&op)?;
    op.apply(&mut doc.state);

    // Re-index the modified node for search and links
    if let Ok(search_index) = state.search_index.lock() {
        if let Some(ref index) = *search_index {
            if let Some(updated_node) = doc.state.nodes.iter().find(|n| n.id == source_uuid) {
                let _ = index.update_node(&source_doc_uuid, updated_node);
                let _ = index.update_links(&source_doc_uuid, updated_node);
            }
        }
    }

    Ok(())
}
