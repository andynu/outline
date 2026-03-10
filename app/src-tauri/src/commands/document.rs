use tauri::State;
use uuid::Uuid;

use outline_core::data::{
    documents_dir, ensure_dirs, short_ids, Document, DocumentState, Node, NodeType,
    move_document_to_folder as move_doc_to_folder_impl,
};
use outline_core::search::SearchIndex;

use super::{parse_uuid, AppState};

/// Load a document by ID, or create/load the default test document
#[tauri::command]
pub fn load_document(
    state: State<AppState>,
    doc_id: Option<String>,
) -> Result<DocumentState, String> {
    ensure_dirs()?;

    let doc_uuid = if let Some(id_str) = doc_id {
        parse_uuid(&id_str)?
    } else {
        // Use a fixed UUID for the default/test document
        Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap()
    };

    let doc_dir = documents_dir().join(doc_uuid.to_string());

    let mut doc = if doc_dir.exists() {
        Document::load(doc_dir)?
    } else {
        // Create new document with sample data
        let mut doc = Document::create(doc_dir)?;
        create_sample_data(&mut doc)?;
        doc
    };

    // Ensure all nodes have short IDs and get the document prefix
    let prefix = short_ids::ensure_short_ids(&mut doc)?;
    let mut doc_state = doc.state.clone();
    doc_state.doc_id = Some(doc_uuid.to_string());
    doc_state.doc_prefix = Some(prefix);

    // Index document for search in background (don't block loading)
    let nodes_for_index = doc_state.nodes.clone();
    std::thread::spawn(move || {
        // Re-open search index in this thread
        if let Ok(index) = SearchIndex::open() {
            if let Err(e) = index.index_document(&doc_uuid, &nodes_for_index) {
                log::warn!("Failed to index document: {}", e);
            }
            if let Err(e) = index.update_document_links(&doc_uuid, &nodes_for_index) {
                log::warn!("Failed to update document links: {}", e);
            }
            log::info!("Background indexing complete for {} nodes", nodes_for_index.len());
        }
    });

    // Store current document
    let mut current = state.current_document.lock().unwrap();
    *current = Some(doc);

    Ok(doc_state)
}

/// Compact the current document (merge pending into state.json)
#[tauri::command]
pub fn compact_document(state: State<AppState>) -> Result<(), String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;
    doc.compact()
}

/// Delete a document by ID (removes directory, search index entries, and folder assignments)
#[tauri::command]
pub fn delete_document(state: State<AppState>, doc_id: String) -> Result<(), String> {
    let doc_uuid = parse_uuid(&doc_id)?;
    let doc_dir = documents_dir().join(&doc_id);

    // Remove the document directory
    if doc_dir.exists() {
        std::fs::remove_dir_all(&doc_dir)
            .map_err(|e| format!("Failed to delete document directory: {}", e))?;
    }

    // Clear search index entries
    if let Ok(index) = SearchIndex::open() {
        let _ = index.index_document(&doc_uuid, &[]);
        let _ = index.update_document_links(&doc_uuid, &[]);
    }

    // Remove from any folder assignments
    let _ = move_doc_to_folder_impl(&doc_id, None, None);

    // If this was the currently loaded document, clear it
    let mut current = state.current_document.lock().unwrap();
    if let Some(ref doc) = *current {
        if doc.id == doc_uuid {
            *current = None;
        }
    }

    Ok(())
}

/// Check if document has external changes (from sync)
#[tauri::command]
pub fn check_for_changes(state: State<AppState>) -> Result<bool, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;
    Ok(doc.has_external_changes())
}

/// Reload document if there are external changes
#[tauri::command]
pub fn reload_if_changed(state: State<AppState>) -> Result<Option<DocumentState>, String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;

    if doc.has_external_changes() {
        doc.reload()?;

        // Re-index after reload
        // Note: We'd need access to search_index here, but for simplicity
        // the frontend can call load_document again if needed

        Ok(Some(doc.state.clone()))
    } else {
        Ok(None)
    }
}

/// Document info for listing
#[derive(Clone, serde::Serialize)]
pub struct DocumentInfo {
    pub id: String,
    pub title: String,
    pub node_count: usize,
    pub title_node_id: Option<String>,  // ID of the first root node (for renaming)
}

/// List all available documents
#[tauri::command]
pub fn list_documents() -> Result<Vec<DocumentInfo>, String> {
    use outline_core::data::list_documents as list_doc_ids;
    ensure_dirs()?;

    let doc_ids = list_doc_ids()?;
    let mut documents = Vec::new();

    for doc_id in doc_ids {
        let doc_dir = documents_dir().join(doc_id.to_string());
        if let Ok(doc) = Document::load(doc_dir) {
            // Get first root node (for title and renaming)
            let first_root = doc
                .state
                .nodes
                .iter()
                .filter(|n| n.parent_id.is_none())
                .min_by_key(|n| n.position);

            let title = first_root
                .map(|n| strip_html_for_title(&n.content))
                .unwrap_or_else(|| "Untitled".to_string());

            let title_node_id = first_root.map(|n| n.id.to_string());

            documents.push(DocumentInfo {
                id: doc_id.to_string(),
                title,
                node_count: doc.state.nodes.len(),
                title_node_id,
            });
        }
    }

    Ok(documents)
}

/// A dated node with its document context
#[derive(Clone, serde::Serialize)]
pub struct DatedNodeInfo {
    pub id: String,
    pub content: String,
    pub date: String,
    pub date_end: Option<String>,
    pub node_type: NodeType,
    pub is_checked: bool,
    pub date_recurrence: Option<String>,
    pub defer_date: Option<String>,
    pub document_id: String,
    pub document_title: String,
}

/// Get all nodes with dates across all documents
#[tauri::command]
pub fn get_all_dated_nodes() -> Result<Vec<DatedNodeInfo>, String> {
    use outline_core::data::list_documents as list_doc_ids;
    ensure_dirs()?;

    let doc_ids = list_doc_ids()?;
    let mut results = Vec::new();

    for doc_id in doc_ids {
        let doc_dir = documents_dir().join(doc_id.to_string());
        if let Ok(doc) = Document::load(doc_dir) {
            // Get document title from first root node
            let title = doc
                .state
                .nodes
                .iter()
                .filter(|n| n.parent_id.is_none())
                .min_by_key(|n| n.position)
                .map(|n| strip_html_for_title(&n.content))
                .unwrap_or_else(|| "Untitled".to_string());

            // Collect dated nodes
            for node in &doc.state.nodes {
                if let Some(ref date) = node.date {
                    results.push(DatedNodeInfo {
                        id: node.id.to_string(),
                        content: node.content.clone(),
                        date: date.clone(),
                        date_end: node.date_end.clone(),
                        node_type: node.node_type.clone(),
                        is_checked: node.is_checked,
                        date_recurrence: node.date_recurrence.clone(),
                        defer_date: node.defer_date.clone(),
                        document_id: doc_id.to_string(),
                        document_title: title.clone(),
                    });
                }
            }
        }
    }

    Ok(results)
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

/// Strip HTML tags for display (simple version)
pub(crate) fn strip_html_for_title(html: &str) -> String {
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
