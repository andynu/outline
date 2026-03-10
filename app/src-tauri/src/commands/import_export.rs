use tauri::State;
use uuid::Uuid;

use outline_core::data::{
    documents_dir, ensure_dirs, update_op, Document, DocumentState, Node, NodeChanges,
    Operation,
};

use super::AppState;

/// Import result for OPML as new document
#[derive(Clone, serde::Serialize)]
pub struct ImportResult {
    pub doc_id: String,
    pub title: String,
    pub node_count: usize,
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
            defer_date: node.defer_date,
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
            || changes.defer_date.is_some()
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

    let nodes = outline_core::import_export::parse_opml(&content)?;
    import_nodes_to_document(doc, nodes)?;

    Ok(doc.state.clone())
}

/// Import OPML content as a new document
#[tauri::command]
pub fn import_opml_as_document(
    state: State<AppState>,
    content: String,
) -> Result<ImportResult, String> {
    ensure_dirs()?;

    // Parse OPML and extract title
    let nodes = outline_core::import_export::parse_opml(&content)?;
    let title = outline_core::import_export::get_opml_title(&content)
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

    // Get or create folder if specified (reuses existing folder with same name)
    let folder_id = if let Some(ref name) = folder_name {
        Some(outline_core::data::get_or_create_folder(name)?.id)
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
        let nodes = match outline_core::import_export::parse_opml(&content) {
            Ok(nodes) => nodes,
            Err(e) => {
                log::warn!("Failed to parse {}: {}", name, e);
                continue;
            }
        };

        let title = outline_core::import_export::get_opml_title(&content)
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
            let _ = outline_core::data::move_document_to_folder(&doc_uuid.to_string(), Some(fid), None);
        }

        results.push(ImportResult {
            doc_id: doc_uuid.to_string(),
            title,
            node_count,
        });
    }

    Ok(results)
}

/// Find and import the latest Dynalist OPML backup from Dropbox
#[tauri::command]
pub fn import_latest_dynalist_backup(
    state: State<AppState>,
    folder_name: Option<String>,
) -> Result<Vec<ImportResult>, String> {
    // Find Dropbox Dynalist backup directory
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let backup_dir = home.join("Dropbox/Apps/Dynalist/backups");

    if !backup_dir.exists() {
        return Err(format!("Dynalist backup directory not found: {:?}", backup_dir));
    }

    // Find the latest OPML backup
    let mut backups: Vec<_> = std::fs::read_dir(&backup_dir)
        .map_err(|e| format!("Failed to read backup directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.starts_with("dynalist-backup-opml-") && name.ends_with(".zip")
        })
        .collect();

    if backups.is_empty() {
        return Err("No Dynalist OPML backups found".to_string());
    }

    // Sort by modification time (newest first)
    backups.sort_by(|a, b| {
        let a_time = a.metadata().and_then(|m| m.modified()).ok();
        let b_time = b.metadata().and_then(|m| m.modified()).ok();
        b_time.cmp(&a_time)
    });

    let latest = &backups[0];
    let zip_path = latest.path().to_string_lossy().to_string();

    log::info!("Importing latest Dynalist backup: {}", zip_path);

    // Use the existing import function
    import_dynalist_backup(state, zip_path, folder_name)
}

/// Export current document to OPML format
#[tauri::command]
pub fn export_opml(state: State<AppState>, title: String) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    outline_core::import_export::generate_opml(&doc.state.nodes, &title)
}

/// Export current document to Markdown format
#[tauri::command]
pub fn export_markdown(state: State<AppState>) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    Ok(outline_core::import_export::generate_markdown(&doc.state.nodes))
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
    let mut nodes_to_export: Vec<&outline_core::data::Node> = Vec::new();
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
    let owned_nodes: Vec<outline_core::data::Node> = nodes_to_export.iter().map(|n| (*n).clone()).collect();

    // For selected nodes that are at root level in our export, we need to handle parent_id
    // Create a modified version where selected nodes become roots
    let mut export_nodes: Vec<outline_core::data::Node> = Vec::new();
    for mut node in owned_nodes {
        // If this node's parent is not in our export set, make it a root
        if let Some(parent_id) = node.parent_id {
            if !ids_to_export.contains(&parent_id) {
                node.parent_id = None;
            }
        }
        export_nodes.push(node);
    }

    Ok(outline_core::import_export::generate_markdown(&export_nodes))
}

/// Export current document to JSON backup format
#[tauri::command]
pub fn export_json(state: State<AppState>) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    outline_core::import_export::generate_json_backup(&doc.state.nodes)
}

/// Export current document to standalone HTML
#[tauri::command]
pub fn export_html(state: State<AppState>, title: String, dark_mode: bool) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    Ok(outline_core::import_export::generate_html(&doc.state.nodes, &title, dark_mode))
}

/// Import JSON backup into the current document
#[tauri::command]
pub fn import_json(
    state: State<AppState>,
    content: String,
) -> Result<DocumentState, String> {
    let mut current = state.current_document.lock().unwrap();
    let doc = current.as_mut().ok_or("No document loaded")?;

    let nodes = outline_core::import_export::parse_json_backup(&content)?;
    import_nodes_to_document(doc, nodes)?;

    Ok(doc.state.clone())
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
