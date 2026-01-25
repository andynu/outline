use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use crate::data::{
    create_op, create_op_with_id, data_dir, default_data_dir, delete_op, documents_dir, ensure_dirs,
    move_op, save_config, set_data_dir, update_op, Document, DocumentState, InboxConfig, InboxItem,
    get_inbox_config, set_inbox_config as set_inbox_config_impl, clear_inbox_config as clear_inbox_config_impl,
    Node, NodeChanges, NodeType, Operation, read_inbox, remove_inbox_items,
    // Folder management
    Folder, FolderState, load_folders,
    create_folder as create_folder_impl,
    update_folder as update_folder_impl,
    delete_folder as delete_folder_impl,
    move_document_to_folder as move_doc_to_folder_impl,
    reorder_folders as reorder_folders_impl,
};
use crate::search::{BacklinkResult, SearchIndex, SearchResult};
use crate::watcher::WatcherState;

/// Parse a UUID string, returning a descriptive error
fn parse_uuid(id: &str) -> Result<Uuid, String> {
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

    let doc = if doc_dir.exists() {
        Document::load(doc_dir)?
    } else {
        // Create new document with sample data
        let mut doc = Document::create(doc_dir)?;
        create_sample_data(&mut doc)?;
        doc
    };

    let doc_state = doc.state.clone();

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

/// Compact the current document (merge pending into state.json)
#[tauri::command]
pub fn compact_document(state: State<AppState>) -> Result<(), String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;
    doc.compact()
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
    use crate::data::list_documents as list_doc_ids;
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

/// Generate iCalendar feed for all dated items in a document
#[tauri::command]
pub fn generate_ical_feed(state: State<AppState>) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    // Build iCalendar content
    let mut ical = String::new();
    ical.push_str("BEGIN:VCALENDAR\r\n");
    ical.push_str("VERSION:2.0\r\n");
    ical.push_str("PRODID:-//Outline//NONSGML v1.0//EN\r\n");
    ical.push_str("CALSCALE:GREGORIAN\r\n");
    ical.push_str("METHOD:PUBLISH\r\n");
    ical.push_str("X-WR-CALNAME:Outline Tasks\r\n");

    for node in &doc.state.nodes {
        if let Some(ref date) = node.date {
            // Create VEVENT for each dated item
            ical.push_str("BEGIN:VEVENT\r\n");

            // UID - unique identifier
            ical.push_str(&format!("UID:{}@outline.local\r\n", node.id));

            // DTSTAMP - creation timestamp
            ical.push_str(&format!(
                "DTSTAMP:{}\r\n",
                node.created_at.format("%Y%m%dT%H%M%SZ")
            ));

            // DTSTART - all-day event format
            let date_compact = date.replace("-", "");
            ical.push_str(&format!("DTSTART;VALUE=DATE:{}\r\n", date_compact));

            // SUMMARY - strip HTML from content
            let summary = strip_html_for_title(&node.content);
            let escaped_summary = escape_ical_text(&summary);
            ical.push_str(&format!("SUMMARY:{}\r\n", escaped_summary));

            // STATUS - based on is_checked
            if node.is_checked {
                ical.push_str("STATUS:COMPLETED\r\n");
            } else {
                ical.push_str("STATUS:CONFIRMED\r\n");
            }

            // RRULE - if recurring
            if let Some(ref rrule) = node.date_recurrence {
                ical.push_str(&format!("RRULE:{}\r\n", rrule));
            }

            // DESCRIPTION - note field if present
            if let Some(ref note) = node.note {
                let escaped_note = escape_ical_text(note);
                ical.push_str(&format!("DESCRIPTION:{}\r\n", escaped_note));
            }

            ical.push_str("END:VEVENT\r\n");
        }
    }

    ical.push_str("END:VCALENDAR\r\n");

    Ok(ical)
}

/// Escape text for iCalendar format
fn escape_ical_text(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace(',', "\\,")
        .replace(';', "\\;")
}

/// Calculate the next occurrence date given an RRULE and start date
#[tauri::command]
pub fn get_next_occurrence(
    rrule_str: String,
    after_date: String,
) -> Result<Option<String>, String> {
    use chrono::NaiveDate;
    use rrule::RRuleSet;

    // Parse the after_date (ISO format: YYYY-MM-DD)
    let after = NaiveDate::parse_from_str(&after_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    // Format date for DTSTART (next day after the completion date)
    let next_day = after + chrono::Duration::days(1);
    let dtstart = format!(
        "{}{}{}T000000Z",
        next_day.format("%Y"),
        next_day.format("%m"),
        next_day.format("%d")
    );

    // Build the full RRULE string with DTSTART
    // rrule_str format: FREQ=DAILY;INTERVAL=1 or FREQ=WEEKLY;BYDAY=MO,WE,FR etc.
    let full_rrule = format!("DTSTART:{}\nRRULE:{}", dtstart, rrule_str);

    // Parse the RRuleSet
    let rrule_set: RRuleSet = full_rrule.parse()
        .map_err(|e| format!("Invalid RRULE: {}", e))?;

    // Get the first occurrence
    let result = rrule_set.all(1);

    if let Some(dt) = result.dates.first() {
        // Format as ISO date
        let date_str = dt.format("%Y-%m-%d").to_string();
        Ok(Some(date_str))
    } else {
        Ok(None)
    }
}

/// Get all inbox items
#[tauri::command]
pub fn get_inbox() -> Result<Vec<InboxItem>, String> {
    read_inbox()
}

/// Get inbox item count (for badge display)
#[tauri::command]
pub fn get_inbox_count() -> Result<usize, String> {
    read_inbox().map(|items| items.len())
}

/// Remove processed inbox items by ID
#[tauri::command]
pub fn clear_inbox_items(ids: Vec<String>) -> Result<(), String> {
    remove_inbox_items(&ids)
}

/// Import nodes into a document by creating operations for each node.
/// This is shared logic used by both OPML and JSON import commands.
fn import_nodes_to_document(doc: &mut Document, nodes: Vec<Node>) -> Result<(), String> {
    for node in nodes {
        // Create the base node
        let create_op = Operation::Create {
            id: node.id,
            parent_id: node.parent_id,
            position: node.position,
            content: node.content.clone(),
            node_type: node.node_type.clone(),
            updated_at: node.updated_at,
        };
        doc.append_op(&create_op)?;
        create_op.apply(&mut doc.state);

        // Build changes for any additional metadata
        let changes = NodeChanges {
            note: node.note,
            heading_level: node.heading_level,
            is_checked: if node.is_checked { Some(true) } else { None },
            color: node.color,
            tags: if node.tags.is_empty() {
                None
            } else {
                Some(node.tags)
            },
            date: node.date,
            date_recurrence: node.date_recurrence,
            collapsed: if node.collapsed { Some(true) } else { None },
            mirror_source_id: node.mirror_source_id,
            ..Default::default()
        };

        // Only create update operation if there's something to update
        let has_changes = changes.note.is_some()
            || changes.heading_level.is_some()
            || changes.is_checked.is_some()
            || changes.color.is_some()
            || changes.tags.is_some()
            || changes.date.is_some()
            || changes.date_recurrence.is_some()
            || changes.collapsed.is_some()
            || changes.mirror_source_id.is_some();

        if has_changes {
            let update = update_op(node.id, changes);
            doc.append_op(&update)?;
            update.apply(&mut doc.state);
        }
    }
    Ok(())
}

/// Import OPML content into the current document
#[tauri::command]
pub fn import_opml(
    state: State<AppState>,
    content: String,
) -> Result<DocumentState, String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;

    let nodes = crate::import_export::parse_opml(&content)?;
    import_nodes_to_document(doc, nodes)?;

    Ok(doc.state.clone())
}

/// Import result for OPML as new document
#[derive(Clone, serde::Serialize)]
pub struct ImportResult {
    pub doc_id: String,
    pub title: String,
    pub node_count: usize,
}

/// Import OPML content as a new document
#[tauri::command]
pub fn import_opml_as_document(
    state: State<AppState>,
    content: String,
) -> Result<ImportResult, String> {
    ensure_dirs()?;

    // Parse OPML and extract title
    let nodes = crate::import_export::parse_opml(&content)?;
    let title = crate::import_export::get_opml_title(&content)
        .unwrap_or_else(|| "Imported Document".to_string());

    // Create a new document with a new UUID
    let doc_uuid = Uuid::now_v7();
    let doc_dir = documents_dir().join(doc_uuid.to_string());

    let mut doc = Document::create(doc_dir)?;
    import_nodes_to_document(&mut doc, nodes)?;

    let node_count = doc.state.nodes.len();

    // Index the new document for search
    if let Ok(search_index) = state.search_index.lock() {
        if let Some(ref index) = *search_index {
            if let Err(e) = index.index_document(&doc_uuid, &doc.state.nodes) {
                log::warn!("Failed to index imported document: {}", e);
            }
            if let Err(e) = index.update_document_links(&doc_uuid, &doc.state.nodes) {
                log::warn!("Failed to update links for imported document: {}", e);
            }
        }
    }

    // Store as current document
    let mut current = state.current_document.lock().unwrap();
    *current = Some(doc);

    Ok(ImportResult {
        doc_id: doc_uuid.to_string(),
        title,
        node_count,
    })
}

/// Import a Dynalist backup zip file, creating documents in an optional folder
#[tauri::command]
pub fn import_dynalist_backup(
    state: State<AppState>,
    zip_path: String,
    folder_name: Option<String>,
) -> Result<Vec<ImportResult>, String> {
    use std::io::Read;

    ensure_dirs()?;

    // Open the zip file
    let file = std::fs::File::open(&zip_path)
        .map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    // Create folder if specified
    let folder_id = if let Some(ref name) = folder_name {
        Some(crate::data::create_folder(name)?.id)
    } else {
        None
    };

    let mut results = Vec::new();
    let search_index = state.search_index.lock().ok();

    // Process each file in the archive
    for i in 0..archive.len() {
        let mut zip_file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let name = zip_file.name().to_string();

        // Only process .opml files
        if !name.to_lowercase().ends_with(".opml") {
            continue;
        }

        // Read file content
        let mut content = String::new();
        zip_file.read_to_string(&mut content)
            .map_err(|e| format!("Failed to read {}: {}", name, e))?;

        // Parse OPML and get title
        let nodes = match crate::import_export::parse_opml(&content) {
            Ok(nodes) => nodes,
            Err(e) => {
                log::warn!("Failed to parse {}: {}", name, e);
                continue;
            }
        };

        let title = crate::import_export::get_opml_title(&content)
            .unwrap_or_else(|| {
                // Use filename without extension as fallback title
                name.trim_end_matches(".opml")
                    .trim_end_matches(".OPML")
                    .to_string()
            });

        // Create new document
        let doc_uuid = Uuid::now_v7();
        let doc_dir = documents_dir().join(doc_uuid.to_string());

        let mut doc = match Document::create(doc_dir) {
            Ok(d) => d,
            Err(e) => {
                log::warn!("Failed to create document for {}: {}", name, e);
                continue;
            }
        };

        if let Err(e) = import_nodes_to_document(&mut doc, nodes.clone()) {
            log::warn!("Failed to import nodes for {}: {}", name, e);
            continue;
        }

        let node_count = doc.state.nodes.len();

        // Index for search
        if let Some(ref index_guard) = search_index {
            if let Some(ref index) = **index_guard {
                let _ = index.index_document(&doc_uuid, &doc.state.nodes);
                let _ = index.update_document_links(&doc_uuid, &doc.state.nodes);
            }
        }

        // Move to folder if specified
        if let Some(ref fid) = folder_id {
            let _ = crate::data::move_document_to_folder(&doc_uuid.to_string(), Some(fid), None);
        }

        results.push(ImportResult {
            doc_id: doc_uuid.to_string(),
            title,
            node_count,
        });
    }

    Ok(results)
}

/// Export current document to OPML format
#[tauri::command]
pub fn export_opml(state: State<AppState>, title: String) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    crate::import_export::generate_opml(&doc.state.nodes, &title)
}

/// Export current document to Markdown format
#[tauri::command]
pub fn export_markdown(state: State<AppState>) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    Ok(crate::import_export::generate_markdown(&doc.state.nodes))
}

/// Export selected nodes and their children to markdown
#[tauri::command]
pub fn export_selection_markdown(
    state: State<AppState>,
    node_ids: Vec<String>,
    include_completed_children: bool,
) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    // Parse node IDs
    let selected_ids: std::collections::HashSet<uuid::Uuid> = node_ids
        .iter()
        .filter_map(|id| uuid::Uuid::parse_str(id).ok())
        .collect();

    if selected_ids.is_empty() {
        return Err("No valid node IDs provided".to_string());
    }

    // Collect all nodes to export: selected nodes + their descendants
    let mut nodes_to_export: Vec<&crate::data::Node> = Vec::new();
    let mut ids_to_export: std::collections::HashSet<uuid::Uuid> = std::collections::HashSet::new();

    // First, add all selected nodes
    for node in &doc.state.nodes {
        if selected_ids.contains(&node.id) {
            ids_to_export.insert(node.id);
        }
    }

    // Then, recursively add all descendants
    let mut changed = true;
    while changed {
        changed = false;
        for node in &doc.state.nodes {
            if let Some(parent_id) = node.parent_id {
                if ids_to_export.contains(&parent_id) && !ids_to_export.contains(&node.id) {
                    // Skip completed children if not including them
                    if !include_completed_children && node.is_checked {
                        continue;
                    }
                    ids_to_export.insert(node.id);
                    changed = true;
                }
            }
        }
    }

    // Collect nodes that are in our export set
    for node in &doc.state.nodes {
        if ids_to_export.contains(&node.id) {
            nodes_to_export.push(node);
        }
    }

    // Generate markdown - need to create owned nodes for the generate function
    let owned_nodes: Vec<crate::data::Node> = nodes_to_export.iter().map(|n| (*n).clone()).collect();

    // For selected nodes that are at root level in our export, we need to handle parent_id
    // Create a modified version where selected nodes become roots
    let mut export_nodes: Vec<crate::data::Node> = Vec::new();
    for mut node in owned_nodes {
        // If this node's parent is not in our export set, make it a root
        if let Some(parent_id) = node.parent_id {
            if !ids_to_export.contains(&parent_id) {
                node.parent_id = None;
            }
        }
        export_nodes.push(node);
    }

    Ok(crate::import_export::generate_markdown(&export_nodes))
}

/// Export current document to JSON backup format
#[tauri::command]
pub fn export_json(state: State<AppState>) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    crate::import_export::generate_json_backup(&doc.state.nodes)
}

/// Import JSON backup into the current document
#[tauri::command]
pub fn import_json(
    state: State<AppState>,
    content: String,
) -> Result<DocumentState, String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;

    let nodes = crate::import_export::parse_json_backup(&content)?;
    import_nodes_to_document(doc, nodes)?;

    Ok(doc.state.clone())
}

/// Data directory info returned to frontend
#[derive(Clone, serde::Serialize)]
pub struct DataDirectoryInfo {
    pub current: String,
    pub default: String,
    pub is_custom: bool,
}

/// Get the current data directory configuration
#[tauri::command]
pub fn get_data_directory() -> DataDirectoryInfo {
    let current = data_dir();
    let default = default_data_dir();
    let is_custom = current != default;

    DataDirectoryInfo {
        current: current.to_string_lossy().to_string(),
        default: default.to_string_lossy().to_string(),
        is_custom,
    }
}

/// Set the data directory (requires app restart to take full effect)
#[tauri::command]
pub fn set_data_directory(path: Option<String>) -> Result<DataDirectoryInfo, String> {
    // Validate path if provided
    if let Some(ref path_str) = path {
        let path_buf = std::path::PathBuf::from(path_str);

        // Check if path exists or can be created
        if !path_buf.exists() {
            std::fs::create_dir_all(&path_buf)
                .map_err(|e| format!("Cannot create directory: {}", e))?;
        }

        // Check if path is a directory
        if !path_buf.is_dir() {
            return Err("Path is not a directory".to_string());
        }

        // Set the runtime override
        set_data_dir(Some(path_buf));
    } else {
        // Reset to default
        set_data_dir(None);
    }

    // Save to config file (preserve existing inbox setting)
    let mut config = crate::data::load_config();
    config.data_directory = path;
    save_config(&config)?;

    Ok(get_data_directory())
}

/// Open a directory picker dialog and return the selected path
#[tauri::command]
pub async fn pick_directory(window: tauri::Window) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    window
        .dialog()
        .file()
        .set_title("Select Data Directory")
        .pick_folder(move |result: Option<FilePath>| {
            let _ = tx.send(result);
        });

    match rx.recv() {
        Ok(Some(file_path)) => {
            // Convert FilePath to string
            let path_str = match file_path {
                FilePath::Path(p) => p.to_string_lossy().to_string(),
                FilePath::Url(u) => u.path().to_string(),
            };
            Ok(Some(path_str))
        }
        Ok(None) => Ok(None),
        Err(_) => Err("Dialog cancelled".to_string()),
    }
}

// ============================================================================
// Folder Management Commands
// ============================================================================

/// Get all folders and document-folder assignments
#[tauri::command]
pub fn get_folders() -> Result<FolderState, String> {
    load_folders()
}

/// Create a new folder
#[tauri::command]
pub fn create_folder(name: String) -> Result<Folder, String> {
    create_folder_impl(&name)
}

/// Update a folder's name or collapsed state
#[tauri::command]
pub fn update_folder(id: String, name: Option<String>, collapsed: Option<bool>) -> Result<Folder, String> {
    update_folder_impl(&id, name.as_deref(), collapsed)
}

/// Delete a folder (documents move to root level)
#[tauri::command]
pub fn delete_folder(id: String) -> Result<(), String> {
    delete_folder_impl(&id)
}

/// Move a document to a folder (or root level if folder_id is None)
#[tauri::command]
pub fn move_document_to_folder(doc_id: String, folder_id: Option<String>, position: Option<i32>) -> Result<(), String> {
    move_doc_to_folder_impl(&doc_id, folder_id.as_deref(), position)
}

/// Reorder folders by providing the new order of folder IDs
#[tauri::command]
pub fn reorder_folders(folder_ids: Vec<String>) -> Result<(), String> {
    reorder_folders_impl(folder_ids)
}

/// Save content to a file using the native save dialog
#[tauri::command]
pub async fn save_to_file_with_dialog(
    app: tauri::AppHandle,
    content: String,
    suggested_filename: String,
    extension: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // Build the save dialog
    let file_path = app
        .dialog()
        .file()
        .add_filter(&format!("{} Files", extension.to_uppercase()), &[&extension])
        .set_file_name(&suggested_filename)
        .blocking_save_file();

    match file_path {
        Some(file_path) => {
            // Convert FilePath to PathBuf for writing
            let path = file_path
                .into_path()
                .map_err(|e| format!("Failed to get file path: {}", e))?;
            // Write the content to the file
            std::fs::write(&path, &content)
                .map_err(|e| format!("Failed to write file: {}", e))?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None), // User cancelled
    }
}

// ============================================================================
// Inbox Configuration Commands
// ============================================================================

/// Get the current inbox configuration (which node receives quick capture items)
#[tauri::command]
pub fn get_inbox_setting() -> Option<InboxConfig> {
    get_inbox_config()
}

/// Set which node should be the inbox for quick capture items
#[tauri::command]
pub fn set_inbox_setting(document_id: String, node_id: String) -> Result<InboxConfig, String> {
    set_inbox_config_impl(document_id.clone(), node_id.clone())?;
    Ok(InboxConfig { document_id, node_id })
}

/// Clear the inbox setting (items will queue until configured)
#[tauri::command]
pub fn clear_inbox_setting() -> Result<(), String> {
    clear_inbox_config_impl()
}

/// Import all inbox items as children of the configured inbox node
/// Returns the number of items imported
#[tauri::command]
pub fn import_inbox_items(state: State<AppState>) -> Result<u32, String> {
    // Get inbox config
    let inbox_config = get_inbox_config()
        .ok_or("No inbox configured. Please set an inbox node first.")?;

    // Read inbox items
    let items = read_inbox()?;
    if items.is_empty() {
        return Ok(0);
    }

    // Get current document or load the inbox document
    let mut current = state.current_document.lock().unwrap();

    // Check if we need to load a different document
    let doc = if let Some(ref mut doc) = *current {
        // Check if the current document is the inbox document
        if doc.id.to_string() != inbox_config.document_id {
            // Load the inbox document
            let doc_dir = documents_dir().join(&inbox_config.document_id);
            if !doc_dir.exists() {
                return Err("Inbox document not found".to_string());
            }
            *current = Some(Document::load(doc_dir)?);
            current.as_mut().unwrap()
        } else {
            doc
        }
    } else {
        // No document loaded, load the inbox document
        let doc_dir = documents_dir().join(&inbox_config.document_id);
        if !doc_dir.exists() {
            return Err("Inbox document not found".to_string());
        }
        *current = Some(Document::load(doc_dir)?);
        current.as_mut().unwrap()
    };

    // Find the inbox node
    let inbox_node_id = Uuid::parse_str(&inbox_config.node_id)
        .map_err(|e| format!("Invalid inbox node ID: {}", e))?;

    if !doc.state.nodes.iter().any(|n| n.id == inbox_node_id) {
        return Err("Inbox node not found in document".to_string());
    }

    // Get current max position among inbox node's children
    let max_position = doc.state.nodes.iter()
        .filter(|n| n.parent_id == Some(inbox_node_id))
        .map(|n| n.position)
        .max()
        .unwrap_or(-1);

    // Import each item as a child of the inbox node
    let mut imported = 0;
    let mut item_ids = Vec::new();

    for (i, item) in items.iter().enumerate() {
        let position = max_position + 1 + (i as i32);

        // Create the node
        let op = create_op(Some(inbox_node_id), position, item.content.clone());
        let new_id = match &op {
            Operation::Create { id, .. } => *id,
            _ => unreachable!(),
        };

        doc.append_op(&op)?;
        op.apply(&mut doc.state);

        // If item has a note, update it
        if let Some(ref note) = item.note {
            let update = update_op(
                new_id,
                NodeChanges {
                    note: Some(note.clone()),
                    ..Default::default()
                },
            );
            doc.append_op(&update)?;
            update.apply(&mut doc.state);
        }

        item_ids.push(item.id.clone());
        imported += 1;
    }

    // Clear imported items from inbox file
    remove_inbox_items(&item_ids)?;

    Ok(imported)
}

// ============================================================================
// Documents Watcher Commands
// ============================================================================

/// Start the documents directory watcher
#[tauri::command]
pub fn start_documents_watcher(
    app: tauri::AppHandle,
    watcher_state: State<WatcherState>,
) -> Result<bool, String> {
    if watcher_state.is_running() {
        return Ok(false); // Already running
    }

    let handle = crate::watcher::start_watcher(app)?;
    watcher_state.set_handle(handle);
    Ok(true)
}

/// Stop the documents directory watcher
#[tauri::command]
pub fn stop_documents_watcher(watcher_state: State<WatcherState>) -> Result<(), String> {
    watcher_state.stop();
    Ok(())
}

/// Check if the documents watcher is running
#[tauri::command]
pub fn is_documents_watcher_running(watcher_state: State<WatcherState>) -> bool {
    watcher_state.is_running()
}
