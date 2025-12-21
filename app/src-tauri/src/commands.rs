use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use crate::data::{
    create_op, data_dir, default_data_dir, delete_op, documents_dir, ensure_dirs, load_config,
    move_op, save_config, set_data_dir, update_op, AppConfig, Document, DocumentState, InboxItem,
    Node, NodeChanges, Operation, read_inbox, remove_inbox_items,
};
use crate::search::{BacklinkResult, SearchIndex, SearchResult};

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
    let node_uuid = Uuid::parse_str(&node_id).map_err(|e| format!("Invalid UUID: {}", e))?;

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

/// Import OPML content into the current document
#[tauri::command]
pub fn import_opml(
    state: State<AppState>,
    content: String,
) -> Result<DocumentState, String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;

    // Parse OPML
    let nodes = crate::import_export::parse_opml(&content)?;

    // Add nodes to document via operations
    for node in nodes {
        // Create the node
        let create_op = crate::data::Operation::Create {
            id: node.id,
            parent_id: node.parent_id,
            position: node.position,
            content: node.content.clone(),
            node_type: node.node_type.clone(),
            updated_at: node.updated_at,
        };
        doc.append_op(&create_op)?;
        create_op.apply(&mut doc.state);

        // If there's additional metadata, update the node
        let needs_update = node.note.is_some() || node.is_checked || node.color.is_some();
        if needs_update {
            let update_op = update_op(
                node.id,
                NodeChanges {
                    note: node.note,
                    is_checked: if node.is_checked { Some(true) } else { None },
                    color: node.color,
                    ..Default::default()
                },
            );
            doc.append_op(&update_op)?;
            update_op.apply(&mut doc.state);
        }
    }

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

    // Add nodes to document
    for node in &nodes {
        // Create the node
        let create_op = crate::data::Operation::Create {
            id: node.id,
            parent_id: node.parent_id,
            position: node.position,
            content: node.content.clone(),
            node_type: node.node_type.clone(),
            updated_at: node.updated_at,
        };
        doc.append_op(&create_op)?;
        create_op.apply(&mut doc.state);

        // If there's additional metadata, update the node
        let needs_update = node.note.is_some() || node.is_checked || node.color.is_some();
        if needs_update {
            let update_op = update_op(
                node.id,
                NodeChanges {
                    note: node.note.clone(),
                    is_checked: if node.is_checked { Some(true) } else { None },
                    color: node.color.clone(),
                    ..Default::default()
                },
            );
            doc.append_op(&update_op)?;
            update_op.apply(&mut doc.state);
        }
    }

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

    // Parse JSON backup
    let nodes = crate::import_export::parse_json_backup(&content)?;

    // Add nodes to document via operations
    for node in nodes {
        // Create the base node
        let create_op = crate::data::Operation::Create {
            id: node.id,
            parent_id: node.parent_id,
            position: node.position,
            content: node.content.clone(),
            node_type: node.node_type.clone(),
            updated_at: node.updated_at,
        };
        doc.append_op(&create_op)?;
        create_op.apply(&mut doc.state);

        // If node has additional metadata, update it
        let needs_update = node.note.is_some()
            || node.heading_level.is_some()
            || node.is_checked
            || node.color.is_some()
            || !node.tags.is_empty()
            || node.date.is_some()
            || node.date_recurrence.is_some()
            || node.collapsed
            || node.mirror_source_id.is_some();

        if needs_update {
            let update_op = update_op(
                node.id,
                NodeChanges {
                    note: node.note,
                    heading_level: node.heading_level,
                    is_checked: if node.is_checked { Some(true) } else { None },
                    color: node.color,
                    tags: if node.tags.is_empty() { None } else { Some(node.tags) },
                    date: node.date,
                    date_recurrence: node.date_recurrence,
                    collapsed: if node.collapsed { Some(true) } else { None },
                    mirror_source_id: node.mirror_source_id,
                    ..Default::default()
                },
            );
            doc.append_op(&update_op)?;
            update_op.apply(&mut doc.state);
        }
    }

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

    // Save to config file
    let config = AppConfig {
        data_directory: path,
    };
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
