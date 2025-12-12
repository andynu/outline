use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use crate::data::{
    create_op, delete_op, documents_dir, ensure_dirs, move_op, update_op, Document, DocumentState,
    Node, NodeChanges, Operation,
};

/// State managed by Tauri for the current document
pub struct AppState {
    pub current_document: Mutex<Option<Document>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            current_document: Mutex::new(None),
        }
    }
}

/// Load a document by ID, or create/load the default test document
#[tauri::command]
pub fn load_document(
    state: State<AppState>,
    doc_id: Option<String>,
) -> Result<DocumentState, String> {
    ensure_dirs()?;

    let doc_uuid = if let Some(id_str) = doc_id {
        Uuid::parse_str(&id_str).map_err(|e| format!("Invalid UUID: {}", e))?
    } else {
        // Use a fixed UUID for the default/test document
        Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap()
    };

    let doc_dir = documents_dir().join(doc_uuid.to_string());

    let doc = if doc_dir.exists() {
        Document::load(doc_dir)?
    } else {
        // Create new document with sample data
        let mut doc = Document::create(doc_dir)?;
        create_sample_data(&mut doc)?;
        doc
    };

    let doc_state = doc.state.clone();

    // Store current document
    let mut current = state.current_document.lock().unwrap();
    *current = Some(doc);

    Ok(doc_state)
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

    Ok(doc.state.clone())
}

/// Create a new node (convenience command that wraps save_op)
#[tauri::command]
pub fn create_node(
    state: State<AppState>,
    parent_id: Option<String>,
    position: i32,
    content: String,
) -> Result<(Uuid, DocumentState), String> {
    let parent_uuid = if let Some(id_str) = parent_id {
        Some(Uuid::parse_str(&id_str).map_err(|e| format!("Invalid parent UUID: {}", e))?)
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

/// Update a node (convenience command that wraps save_op)
#[tauri::command]
pub fn update_node(
    state: State<AppState>,
    id: String,
    changes: NodeChanges,
) -> Result<DocumentState, String> {
    let node_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid UUID: {}", e))?;
    let op = update_op(node_id, changes);
    save_op(state, op)
}

/// Move a node (convenience command that wraps save_op)
#[tauri::command]
pub fn move_node(
    state: State<AppState>,
    id: String,
    parent_id: Option<String>,
    position: i32,
) -> Result<DocumentState, String> {
    let node_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid UUID: {}", e))?;
    let parent_uuid = if let Some(id_str) = parent_id {
        Some(Uuid::parse_str(&id_str).map_err(|e| format!("Invalid parent UUID: {}", e))?)
    } else {
        None
    };

    let op = move_op(node_id, parent_uuid, position);
    save_op(state, op)
}

/// Delete a node (convenience command that wraps save_op)
#[tauri::command]
pub fn delete_node(state: State<AppState>, id: String) -> Result<DocumentState, String> {
    let node_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid UUID: {}", e))?;
    let op = delete_op(node_id);
    save_op(state, op)
}

/// Compact the current document (merge pending into state.json)
#[tauri::command]
pub fn compact_document(state: State<AppState>) -> Result<(), String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;
    doc.compact()
}

/// Create sample data for a new document
fn create_sample_data(doc: &mut Document) -> Result<(), String> {
    let root1 = Node::new("Welcome to Outline".to_string());
    let root2 = Node::new("Getting Started".to_string());
    let root3 = Node::new("Features".to_string());

    let child1 = Node::new_child(root2.id, 0, "Press Enter to create a new item".to_string());
    let child2 = Node::new_child(root2.id, 1, "Press Tab to indent".to_string());
    let child3 = Node::new_child(root2.id, 2, "Press Shift+Tab to outdent".to_string());

    let feature1 = Node::new_child(root3.id, 0, "Hierarchical notes".to_string());
    let feature2 = Node::new_child(root3.id, 1, "Rich text editing".to_string());
    let feature3 = Node::new_child(root3.id, 2, "Cross-device sync (coming soon)".to_string());

    // Create root nodes first
    let mut root1_mut = root1;
    root1_mut.position = 0;

    let mut root2_mut = root2;
    root2_mut.position = 1;

    let mut root3_mut = root3;
    root3_mut.position = 2;

    doc.state.nodes = vec![
        root1_mut,
        root2_mut,
        child1,
        child2,
        child3,
        root3_mut,
        feature1,
        feature2,
        feature3,
    ];

    doc.save_state()?;

    Ok(())
}
