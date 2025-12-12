use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use crate::data::{
    create_op, delete_op, documents_dir, ensure_dirs, move_op, update_op, Document, DocumentState,
    Node, NodeChanges, Operation,
};
use crate::search::{SearchIndex, SearchResult};

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

    // Index document for search
    if let Ok(search_index) = state.search_index.lock() {
        if let Some(ref index) = *search_index {
            if let Err(e) = index.index_document(&doc_uuid, &doc_state.nodes) {
                log::warn!("Failed to index document: {}", e);
            }
        }
    }

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

/// Search for nodes matching a query
#[tauri::command]
pub fn search(
    state: State<AppState>,
    query: String,
    doc_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let doc_uuid = if let Some(id_str) = doc_id {
        Some(Uuid::parse_str(&id_str).map_err(|e| format!("Invalid UUID: {}", e))?)
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

/// Document info for listing
#[derive(Clone, serde::Serialize)]
pub struct DocumentInfo {
    pub id: String,
    pub title: String,
    pub node_count: usize,
}

/// List all available documents
#[tauri::command]
pub fn list_documents() -> Result<Vec<DocumentInfo>, String> {
    use crate::data::list_documents as list_doc_ids;
    ensure_dirs()?;

    let doc_ids = list_doc_ids()?;
    let mut documents = Vec::new();

    for doc_id in doc_ids {
        let doc_dir = documents_dir().join(doc_id.to_string());
        if let Ok(doc) = Document::load(doc_dir) {
            // Get title from first root node
            let title = doc
                .state
                .nodes
                .iter()
                .filter(|n| n.parent_id.is_none())
                .min_by_key(|n| n.position)
                .map(|n| strip_html_for_title(&n.content))
                .unwrap_or_else(|| "Untitled".to_string());

            documents.push(DocumentInfo {
                id: doc_id.to_string(),
                title,
                node_count: doc.state.nodes.len(),
            });
        }
    }

    Ok(documents)
}

/// Strip HTML tags for display (simple version)
fn strip_html_for_title(html: &str) -> String {
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
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .trim()
        .to_string()
}
