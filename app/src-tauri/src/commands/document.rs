use tauri::State;
use uuid::Uuid;

use outline_core::data::{
    documents_dir, ensure_dirs, short_ids, Document, DocumentState, Node, NodeType,
    move_document_to_folder as move_doc_to_folder_impl,
};
use outline_core::search::SearchIndex;

use super::{parse_uuid, AppState};

/// UUID of the default/first-run document.
///
/// This is the only document that `load_document` is allowed to auto-seed
/// when its folder is missing (first launch with no data at all). Every
/// other doc_id must refer to an already-existing folder — otherwise
/// `load_document` errors out, so a missing folder (sync glitch, manual
/// delete, stale entry in doc_prefixes.json) surfaces to the user instead
/// of silently destroying the phantom.
const DEFAULT_DOC_UUID: &str = "00000000-0000-0000-0000-000000000001";

/// Decide how load_document should resolve a (doc_id, folder-exists) pair.
///
/// Extracted as a pure function so the "silent re-seed" data-loss bug
/// (otl-sj95) has unit-test coverage without requiring a Tauri runtime.
#[derive(Debug, PartialEq, Eq)]
enum LoadAction {
    /// Folder exists — load it.
    Load,
    /// First-ever launch (no other docs exist) — seed with the sample
    /// Welcome/Getting Started/Features tree.
    SeedSampleData,
    /// Default-doc folder missing but other docs exist — seed an empty
    /// single-bullet doc (user has already past the onboarding point).
    SeedEmpty,
    /// Explicit doc_id whose folder is missing — caller-facing error.
    MissingError,
}

fn decide_load_action(
    doc_id_explicit: bool,
    is_default: bool,
    folder_exists: bool,
    other_docs_exist: bool,
) -> LoadAction {
    if folder_exists {
        LoadAction::Load
    } else if !doc_id_explicit || is_default {
        if other_docs_exist {
            LoadAction::SeedEmpty
        } else {
            LoadAction::SeedSampleData
        }
    } else {
        LoadAction::MissingError
    }
}

/// Load a document by ID, or load the default document on first run.
///
/// Behavior:
/// - `doc_id = None`: load (or seed on first run) the default document.
/// - `doc_id = Some(id)`: the folder MUST already exist. If it doesn't,
///   this returns an error rather than silently re-seeding a fresh doc
///   on top of whatever the user actually meant to open. See issue
///   otl-sj95 for the data-loss scenario this prevents.
///
/// Use `create_document` to intentionally create a new empty document.
#[tauri::command]
pub fn load_document(
    state: State<AppState>,
    doc_id: Option<String>,
) -> Result<DocumentState, String> {
    ensure_dirs()?;

    let doc_id_explicit = doc_id.is_some();
    let (doc_uuid, is_default) = if let Some(id_str) = doc_id {
        let uuid = parse_uuid(&id_str)?;
        let is_default = uuid.to_string() == DEFAULT_DOC_UUID;
        (uuid, is_default)
    } else {
        (Uuid::parse_str(DEFAULT_DOC_UUID).unwrap(), true)
    };

    let doc_dir = documents_dir().join(doc_uuid.to_string());

    let folder_exists = doc_dir.exists();
    let other_docs_exist = other_docs_exist_excluding(&doc_uuid);
    let mut doc = match decide_load_action(
        doc_id_explicit,
        is_default,
        folder_exists,
        other_docs_exist,
    ) {
        LoadAction::Load => {
            let doc = Document::load(doc_dir)?;
            log::info!(
                "load_document: loaded existing {} (existed_on_disk=true, n_nodes={})",
                doc_uuid,
                doc.state.nodes.len()
            );
            doc
        }
        LoadAction::SeedSampleData => {
            log::warn!(
                "load_document: folder missing for {} (existed_on_disk=false), first-ever launch — seeding sample data",
                doc_uuid
            );
            let mut doc = Document::create(doc_dir)?;
            create_sample_data(&mut doc)?;
            log::info!(
                "load_document: seeded default {} with sample data (n_nodes={})",
                doc_uuid,
                doc.state.nodes.len()
            );
            doc
        }
        LoadAction::SeedEmpty => {
            log::warn!(
                "load_document: folder missing for {} (existed_on_disk=false) but other docs exist — seeding empty single-bullet doc",
                doc_uuid
            );
            let mut doc = Document::create(doc_dir)?;
            let root = Node::new(String::new());
            doc.state.nodes = vec![root];
            doc.save_state()?;
            log::info!(
                "load_document: seeded empty {} (n_nodes={})",
                doc_uuid,
                doc.state.nodes.len()
            );
            doc
        }
        LoadAction::MissingError => {
            log::error!(
                "load_document: folder missing for explicit doc {} (existed_on_disk=false), refusing to re-seed",
                doc_uuid
            );
            return Err(format!(
                "Document {} not found on disk. It may have been deleted, unsynced, or moved. Use create_document to make a new document.",
                doc_uuid
            ));
        }
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

/// Create a brand-new empty document and load it.
///
/// This is the intentional "new document" path — distinct from `load_document`,
/// which now refuses to seed a fresh doc when an explicit missing doc_id is
/// provided (see otl-sj95). If `doc_id` is omitted, a fresh UUID is generated.
/// Errors if a document folder already exists for the requested id.
#[tauri::command]
pub fn create_document(
    state: State<AppState>,
    doc_id: Option<String>,
) -> Result<DocumentState, String> {
    ensure_dirs()?;

    let doc_uuid = match doc_id {
        Some(id_str) => parse_uuid(&id_str)?,
        None => Uuid::new_v4(),
    };

    let doc_dir = documents_dir().join(doc_uuid.to_string());
    if doc_dir.exists() {
        return Err(format!("Document {} already exists", doc_uuid));
    }

    let mut doc = Document::create(doc_dir)?;

    // Give new docs a single empty root so the UI has something to focus on.
    let root = Node::new(String::new());
    doc.state.nodes = vec![root];
    doc.save_state()?;

    let prefix = short_ids::ensure_short_ids(&mut doc)?;
    let mut doc_state = doc.state.clone();
    doc_state.doc_id = Some(doc_uuid.to_string());
    doc_state.doc_prefix = Some(prefix);

    // Index in background, mirroring load_document.
    let nodes_for_index = doc_state.nodes.clone();
    std::thread::spawn(move || {
        if let Ok(index) = SearchIndex::open() {
            let _ = index.index_document(&doc_uuid, &nodes_for_index);
            let _ = index.update_document_links(&doc_uuid, &nodes_for_index);
        }
    });

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
    pub prefix: Option<String>,          // Short-ID prefix / slug (e.g. "outline")
}

/// List all available documents
#[tauri::command]
pub fn list_documents() -> Result<Vec<DocumentInfo>, String> {
    use outline_core::data::list_documents as list_doc_ids;
    ensure_dirs()?;

    let doc_ids = list_doc_ids()?;
    let mut documents = Vec::new();

    // Snapshot the prefix map so we can surface the slug to the UI without
    // mutating it on every list (rename_prefix / ensure_short_ids own writes).
    let prefix_map = short_ids::load_prefix_map();

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

            let doc_id_str = doc_id.to_string();
            let prefix = prefix_map
                .prefixes
                .iter()
                .find(|(_, id)| **id == doc_id_str)
                .map(|(p, _)| p.clone());

            documents.push(DocumentInfo {
                id: doc_id_str,
                title,
                node_count: doc.state.nodes.len(),
                title_node_id,
                prefix,
            });
        }
    }

    Ok(documents)
}

/// Rename a document's short-ID prefix (slug).
///
/// Node short_ids are preserved — they continue to resolve against the
/// updated prefix map. See outline_core::data::short_ids::rename_prefix.
#[tauri::command]
pub fn rename_document_prefix(doc_id: String, new_prefix: String) -> Result<(), String> {
    let doc_uuid = parse_uuid(&doc_id)?;
    short_ids::rename_prefix(&doc_uuid, &new_prefix)
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

/// Check whether any document folders exist on disk other than `exclude`.
///
/// Used by load_document to decide between seeding the full sample
/// Welcome/Getting Started/Features tree (true first-run) vs an empty
/// single-bullet doc (subsequent new docs — user already has content).
fn other_docs_exist_excluding(exclude: &Uuid) -> bool {
    use outline_core::data::list_documents as list_doc_ids;
    match list_doc_ids() {
        Ok(ids) => ids.iter().any(|id| id != exclude),
        Err(_) => false,
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    // Regression tests for otl-sj95: load_document must NOT silently re-seed
    // a sample-data doc when an explicit doc_id points at a missing folder.

    #[test]
    fn no_args_first_run_seeds_sample_data() {
        // load_document() with no doc_id, folder absent, no other docs ->
        // seed the default doc with the Welcome sample tree.
        assert_eq!(
            decide_load_action(false, true, false, false),
            LoadAction::SeedSampleData
        );
    }

    #[test]
    fn no_args_with_folder_loads() {
        assert_eq!(
            decide_load_action(false, true, true, false),
            LoadAction::Load
        );
    }

    #[test]
    fn explicit_default_uuid_missing_first_run_seeds_sample() {
        // Passing the default UUID explicitly is still a valid first-run path.
        assert_eq!(
            decide_load_action(true, true, false, false),
            LoadAction::SeedSampleData
        );
    }

    #[test]
    fn explicit_other_uuid_missing_errors_instead_of_seeding() {
        // The bug: a non-default doc_id whose folder is missing must error,
        // not silently produce a fresh Welcome doc that the user could then
        // unknowingly edit or wipe.
        assert_eq!(
            decide_load_action(true, false, false, false),
            LoadAction::MissingError
        );
        // Even when other docs exist, a missing explicit non-default should
        // error rather than re-seed.
        assert_eq!(
            decide_load_action(true, false, false, true),
            LoadAction::MissingError
        );
    }

    #[test]
    fn explicit_other_uuid_present_loads() {
        assert_eq!(
            decide_load_action(true, false, true, false),
            LoadAction::Load
        );
    }

    // Regression tests for otl-x526: subsequent new docs (created when
    // other docs already exist) must NOT re-seed the Welcome sample tree.

    #[test]
    fn default_doc_missing_with_other_docs_seeds_empty_not_sample() {
        // If the default doc's folder is missing but the user has other
        // docs, they've clearly moved past the onboarding phase — seed an
        // empty single-bullet doc rather than re-injecting sample clutter.
        assert_eq!(
            decide_load_action(false, true, false, true),
            LoadAction::SeedEmpty
        );
        assert_eq!(
            decide_load_action(true, true, false, true),
            LoadAction::SeedEmpty
        );
    }
}
