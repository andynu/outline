mod output;

use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process;

use output::OutputMode;

/// Outline CLI — manage outline documents, nodes, and search
#[derive(Parser)]
#[command(name = "otl", version, about)]
struct Cli {
    /// Output JSON instead of human-readable text
    #[arg(long, global = true)]
    json: bool,

    /// Override the data directory (default: ~/.outline-data/)
    #[arg(long, global = true)]
    data_dir: Option<PathBuf>,

    /// Set the active document ID
    #[arg(long, global = true)]
    doc: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Document operations
    Doc {
        #[command(subcommand)]
        command: DocCommand,
    },
    /// Node operations
    Node {
        #[command(subcommand)]
        command: NodeCommand,
    },
    /// Full-text search across documents
    Search {
        /// Search query
        query: String,
        /// Scope search to a specific document
        #[arg(long)]
        doc: Option<String>,
        /// Maximum number of results
        #[arg(long, default_value = "20")]
        limit: usize,
    },
    /// Find nodes that link to a given node
    Backlinks {
        /// Node ID to find backlinks for
        node_id: String,
    },
    /// Inbox operations
    Inbox {
        #[command(subcommand)]
        command: InboxCommand,
    },
    /// Folder operations
    Folder {
        #[command(subcommand)]
        command: FolderCommand,
    },
    /// Export a document
    Export {
        #[command(subcommand)]
        command: ExportCommand,
    },
    /// Import a document
    Import {
        #[command(subcommand)]
        command: ImportCommand,
    },
    /// Merge pending operations into state.json
    Compact {
        /// Document ID (uses active document if not specified)
        doc_id: Option<String>,
    },
    /// Capture an item to a target location
    Capture {
        /// Content to capture
        content: Vec<String>,
        /// Named capture target
        #[arg(long)]
        to: Option<String>,
        /// Note to attach
        #[arg(long)]
        note: Option<String>,
        /// Node type (bullet, checkbox)
        #[arg(long, default_value = "bullet")]
        r#type: String,
        /// Read content from stdin
        #[arg(long)]
        stdin: bool,
    },
    /// Manage capture targets
    Target {
        #[command(subcommand)]
        command: TargetCommand,
    },
}

#[derive(Subcommand)]
enum DocCommand {
    /// List all documents
    List,
    /// Show document or subtree contents as a tree
    Show {
        /// Document or node ID (short ID like inbox-a3x shows subtree)
        id: String,
        /// Show as flat list (one node per line with ID)
        #[arg(long)]
        flat: bool,
        /// Limit tree depth
        #[arg(short = 'L', long)]
        level: Option<usize>,
    },
    /// Delete a document
    Delete {
        /// Document ID
        id: String,
    },
}

#[derive(Subcommand)]
enum NodeCommand {
    /// Create a new node
    Create {
        /// Parent node ID
        parent_id: String,
        /// Node content
        content: String,
        /// Position among siblings
        #[arg(long)]
        position: Option<i32>,
        /// Node type: bullet, checkbox, heading
        #[arg(long, default_value = "bullet")]
        r#type: String,
        /// Note text
        #[arg(long)]
        note: Option<String>,
    },
    /// Update a node's fields
    Update {
        /// Node ID
        id: String,
        /// New content
        #[arg(long)]
        content: Option<String>,
        /// New note
        #[arg(long)]
        note: Option<String>,
        /// Check the checkbox
        #[arg(long)]
        check: bool,
        /// Uncheck the checkbox
        #[arg(long)]
        uncheck: bool,
        /// Node type
        #[arg(long)]
        r#type: Option<String>,
        /// Color label
        #[arg(long)]
        color: Option<String>,
        /// Due date (YYYY-MM-DD)
        #[arg(long)]
        date: Option<String>,
        /// End date for date ranges (YYYY-MM-DD)
        #[arg(long)]
        date_end: Option<String>,
    },
    /// Move a node to a new parent/position
    Move {
        /// Node ID to move
        id: String,
        /// New parent node ID
        #[arg(long)]
        parent: String,
        /// New position among siblings
        #[arg(long)]
        position: i32,
    },
    /// Delete a node and its descendants
    Delete {
        /// Node ID
        id: String,
        /// Skip confirmation
        #[arg(long)]
        force: bool,
    },
}

#[derive(Subcommand)]
enum InboxCommand {
    /// List pending inbox items
    List,
    /// Import inbox items to configured destination
    Import,
    /// Remove specific inbox items by ID
    Clear {
        /// Item IDs to remove
        ids: Vec<String>,
    },
}

#[derive(Subcommand)]
enum FolderCommand {
    /// List all folders
    List,
    /// Create a new folder
    Create {
        /// Folder name
        name: String,
    },
    /// Delete a folder
    Delete {
        /// Folder ID
        id: String,
    },
    /// Move a document to a folder
    MoveDoc {
        /// Document ID
        doc_id: String,
        /// Folder ID (omit to move to root)
        folder_id: Option<String>,
        /// Position within folder
        #[arg(long)]
        position: Option<i32>,
    },
}

#[derive(Subcommand)]
enum ExportCommand {
    /// Export as OPML
    Opml {
        /// Document ID (uses active document if not specified)
        #[arg(long)]
        doc: Option<String>,
    },
    /// Export as Markdown
    Markdown {
        /// Document ID (uses active document if not specified)
        #[arg(long)]
        doc: Option<String>,
    },
    /// Export as JSON backup
    Json {
        /// Document ID (uses active document if not specified)
        #[arg(long)]
        doc: Option<String>,
    },
}

#[derive(Subcommand)]
enum ImportCommand {
    /// Import an OPML file as a new document
    Opml {
        /// Path to OPML file
        file: PathBuf,
    },
    /// Import a JSON backup
    Json {
        /// Path to JSON file
        file: PathBuf,
    },
}

#[derive(Subcommand)]
enum TargetCommand {
    /// List all capture targets
    List,
    /// Add a capture target
    Add {
        /// Target name
        name: String,
        /// Document ID or prefix (inferred from node if omitted; uses root if --node omitted)
        #[arg(long)]
        doc: Option<String>,
        /// Node ID or short ID (uses document root if omitted)
        #[arg(long)]
        node: Option<String>,
    },
    /// Remove a capture target
    Remove {
        /// Target name
        name: String,
    },
    /// Set the default capture target
    SetDefault {
        /// Target name
        name: String,
    },
}

fn main() {
    let cli = Cli::parse();
    let out = OutputMode::new(cli.json);

    // Apply data directory override
    if let Some(ref dir) = cli.data_dir {
        outline_core::data::set_data_dir(Some(dir.clone()));
    } else {
        outline_core::data::init_data_dir_from_config();
    }

    let result = run(cli, &out);
    if let Err(e) = result {
        out.error(&e);
        process::exit(1);
    }
}

fn run(cli: Cli, out: &OutputMode) -> Result<(), String> {
    match cli.command {
        Commands::Doc { command } => match command {
            DocCommand::List => cmd_doc_list(out),
            DocCommand::Show { id, flat, level } => cmd_doc_show(out, &id, flat, level, &cli.doc),
            DocCommand::Delete { id } => cmd_doc_delete(out, &id),
        },
        Commands::Node { command } => match command {
            NodeCommand::Create { parent_id, content, position, r#type, note } => {
                let (doc_id, parent_uuid) = resolve_node_ref(&parent_id, &cli.doc)?;
                cmd_node_create(out, &doc_id, parent_uuid, &content, position, &r#type, note.as_deref())
            }
            NodeCommand::Update { id, content, note, check, uncheck, r#type, color, date, date_end } => {
                let (doc_id, node_uuid) = resolve_node_ref(&id, &cli.doc)?;
                cmd_node_update(out, &doc_id, node_uuid, content, note, check, uncheck, r#type, color, date, date_end)
            }
            NodeCommand::Move { id, parent, position } => {
                let (doc_id, node_uuid) = resolve_node_ref(&id, &cli.doc)?;
                let (_, parent_uuid) = resolve_node_ref(&parent, &Some(doc_id.clone()))?;
                cmd_node_move(out, &doc_id, node_uuid, parent_uuid, position)
            }
            NodeCommand::Delete { id, force } => {
                let (doc_id, node_uuid) = resolve_node_ref(&id, &cli.doc)?;
                cmd_node_delete(out, &doc_id, node_uuid, force)
            }
        },
        Commands::Search { query, doc, limit } => cmd_search(out, &query, doc.as_deref(), limit),
        Commands::Backlinks { node_id } => cmd_backlinks(out, &node_id),
        Commands::Inbox { command } => match command {
            InboxCommand::List => cmd_inbox_list(out),
            InboxCommand::Import => cmd_inbox_import(out),
            InboxCommand::Clear { ids } => cmd_inbox_clear(out, &ids),
        },
        Commands::Folder { command } => match command {
            FolderCommand::List => cmd_folder_list(out),
            FolderCommand::Create { name } => cmd_folder_create(out, &name),
            FolderCommand::Delete { id } => cmd_folder_delete(out, &id),
            FolderCommand::MoveDoc { doc_id, folder_id, position } => {
                cmd_folder_move_doc(out, &doc_id, folder_id.as_deref(), position)
            }
        },
        Commands::Export { command } => match command {
            ExportCommand::Opml { doc } => {
                let doc_ref = doc.or(cli.doc.clone());
                let doc_ref = require_doc_id(&doc_ref)?;
                let doc_uuid = resolve_doc_ref(&doc_ref)?;
                cmd_export_opml(out, &doc_uuid.to_string())
            }
            ExportCommand::Markdown { doc } => {
                let doc_ref = doc.or(cli.doc.clone());
                let doc_ref = require_doc_id(&doc_ref)?;
                let doc_uuid = resolve_doc_ref(&doc_ref)?;
                cmd_export_markdown(out, &doc_uuid.to_string())
            }
            ExportCommand::Json { doc } => {
                let doc_ref = doc.or(cli.doc.clone());
                let doc_ref = require_doc_id(&doc_ref)?;
                let doc_uuid = resolve_doc_ref(&doc_ref)?;
                cmd_export_json(out, &doc_uuid.to_string())
            }
        },
        Commands::Import { command } => match command {
            ImportCommand::Opml { file } => cmd_import_opml(out, &file),
            ImportCommand::Json { file } => cmd_import_json(out, &file),
        },
        Commands::Compact { doc_id } => {
            let doc_ref = doc_id.or(cli.doc.clone());
            let doc_ref = require_doc_id(&doc_ref)?;
            let doc_uuid = resolve_doc_ref(&doc_ref)?;
            cmd_compact(out, &doc_uuid.to_string())
        }
        Commands::Capture { content, to, note, r#type, stdin } => {
            cmd_capture(out, content, to.as_deref(), note.as_deref(), &r#type, stdin)
        }
        Commands::Target { command } => match command {
            TargetCommand::List => cmd_target_list(out),
            TargetCommand::Add { name, doc, node } => cmd_target_add(out, &name, doc.as_deref(), node.as_deref(), &cli.doc),
            TargetCommand::Remove { name } => cmd_target_remove(out, &name),
            TargetCommand::SetDefault { name } => cmd_target_set_default(out, &name),
        }
    }
}

fn require_doc_id(doc_id: &Option<String>) -> Result<String, String> {
    doc_id.clone().ok_or_else(|| "No document specified. Use --doc <id> or set an active document.".to_string())
}

/// Resolve a document reference that could be a UUID or a prefix
fn resolve_doc_ref(input: &str) -> Result<uuid::Uuid, String> {
    // Try as UUID first
    if let Ok(uuid) = uuid::Uuid::parse_str(input) {
        return Ok(uuid);
    }

    // Try as prefix
    let map = outline_core::data::short_ids::load_prefix_map();
    if let Some(doc_id_str) = map.prefixes.get(input) {
        return uuid::Uuid::parse_str(doc_id_str)
            .map_err(|e| format!("Invalid UUID in prefix map: {}", e));
    }

    Err(format!("'{}' is not a valid document UUID or prefix. Run 'outline doc list' to see available documents.", input))
}

/// Resolve a node reference that could be a short ID (prefix-code) or a UUID.
/// Returns (document_uuid_string, node_uuid).
fn resolve_node_ref(input: &str, doc_id: &Option<String>) -> Result<(String, uuid::Uuid), String> {
    // Try as UUID first
    if let Ok(uuid) = uuid::Uuid::parse_str(input) {
        let doc = require_doc_id(doc_id)?;
        return Ok((doc, uuid));
    }

    // Try as short ID (prefix-code format)
    let active_doc = doc_id.as_ref()
        .and_then(|d| uuid::Uuid::parse_str(d).ok().or_else(|| resolve_doc_ref(d).ok()));

    let (doc_uuid, node_uuid) = outline_core::data::short_ids::resolve_short_id(input, active_doc.as_ref())?;
    Ok((doc_uuid.to_string(), node_uuid))
}

// -- Document commands --

fn cmd_doc_list(out: &OutputMode) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document};
    use outline_core::data::short_ids;

    outline_core::data::ensure_dirs()?;
    let docs_dir = documents_dir();

    // Load folder state for document-to-folder mapping
    let folder_state = outline_core::data::load_folders().unwrap_or_default();
    let folder_names: std::collections::HashMap<&str, &str> = folder_state.folders.iter()
        .map(|f| (f.id.as_str(), f.name.as_str()))
        .collect();

    // Load/update prefix map for short IDs
    let mut prefix_map = short_ids::load_prefix_map();
    let mut docs: Vec<serde_json::Value> = Vec::new();

    if docs_dir.exists() {
        for entry in std::fs::read_dir(&docs_dir).map_err(|e| format!("Read documents dir: {}", e))? {
            let entry = entry.map_err(|e| format!("Read entry: {}", e))?;
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if let Ok(doc_uuid) = uuid::Uuid::parse_str(name) {
                        match Document::load(path.clone()) {
                            Ok(doc) => {
                                let title = doc.state.nodes.iter()
                                    .find(|n| n.parent_id.is_none())
                                    .map(|n| strip_html(&n.content))
                                    .unwrap_or_else(|| "(empty)".to_string());

                                let prefix = short_ids::get_or_create_prefix(&doc_uuid, &title, &mut prefix_map);

                                let folder = folder_state.document_folders.get(name)
                                    .and_then(|fid| folder_names.get(fid.as_str()).copied());

                                let mut entry = serde_json::json!({
                                    "id": name,
                                    "prefix": prefix,
                                    "title": title,
                                    "node_count": doc.state.nodes.len(),
                                });
                                if let Some(fname) = folder {
                                    entry["folder"] = serde_json::json!(fname);
                                }
                                docs.push(entry);
                            }
                            Err(e) => {
                                eprintln!("Warning: failed to load document {}: {}", name, e);
                            }
                        }
                    }
                }
            }
        }
    }

    // Save updated prefix map
    let _ = short_ids::save_prefix_map(&prefix_map);

    if out.is_json() {
        out.print_json(&serde_json::json!(docs));
    } else if docs.is_empty() {
        println!("No documents found.");
    } else {
        println!("{:<10} {:<6} {:<14} {}", "Prefix", "Nodes", "Folder", "Title");
        println!("{}", "-".repeat(60));
        for doc in &docs {
            println!("{:<10} {:<6} {:<14} {}",
                doc["prefix"].as_str().unwrap_or(""),
                doc["node_count"].as_u64().unwrap_or(0),
                doc["folder"].as_str().unwrap_or(""),
                doc["title"].as_str().unwrap_or(""),
            );
        }
    }

    Ok(())
}

fn cmd_doc_show(out: &OutputMode, id: &str, flat: bool, max_depth: Option<usize>, active_doc: &Option<String>) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document};
    use outline_core::data::short_ids;

    // Try resolving as a node ref first (short ID like inbox-a3x), fall back to doc ref
    let (doc_id, root_node) = match resolve_node_ref(id, active_doc) {
        Ok((doc_id_str, node_uuid)) => {
            let doc_uuid = uuid::Uuid::parse_str(&doc_id_str)
                .map_err(|e| format!("Invalid document ID: {}", e))?;
            (doc_uuid, Some(node_uuid))
        }
        Err(_) => (resolve_doc_ref(id)?, None),
    };

    let doc_dir = documents_dir().join(doc_id.to_string());
    if !doc_dir.exists() {
        return Err(format!("Document not found: {}", id));
    }

    let mut doc = Document::load(doc_dir)?;
    let prefix = short_ids::ensure_short_ids(&mut doc)?;

    if out.is_json() {
        if let Some(root_id) = root_node {
            // Collect subtree node IDs
            let subtree = collect_subtree(&doc.state.nodes, root_id);
            let nodes: Vec<_> = doc.state.nodes.iter()
                .filter(|n| subtree.contains(&n.id))
                .collect();
            out.print_json(&serde_json::json!({
                "id": doc_id.to_string(),
                "root_node": root_id.to_string(),
                "prefix": prefix,
                "nodes": nodes,
            }));
        } else {
            out.print_json(&serde_json::json!({
                "id": doc_id.to_string(),
                "prefix": prefix,
                "nodes": doc.state.nodes,
            }));
        }
    } else if flat {
        let nodes: Vec<_> = if let Some(root_id) = root_node {
            let subtree = collect_subtree(&doc.state.nodes, root_id);
            doc.state.nodes.iter().filter(|n| subtree.contains(&n.id)).collect()
        } else {
            doc.state.nodes.iter().collect()
        };
        for node in nodes {
            let content = strip_html(&node.content);
            let sid = node.short_id.as_deref().unwrap_or("????");
            println!("{}-{} {}", prefix, sid, content);
        }
    } else {
        let root_parent = root_node.map(|id| Some(id)).unwrap_or(None);
        print_tree(&doc.state.nodes, root_parent, 0, max_depth, &prefix);
    }

    Ok(())
}

fn collect_subtree(nodes: &[outline_core::data::Node], root_id: uuid::Uuid) -> std::collections::HashSet<uuid::Uuid> {
    let mut result = std::collections::HashSet::new();
    result.insert(root_id);
    let mut stack = vec![root_id];
    while let Some(parent) = stack.pop() {
        for node in nodes {
            if node.parent_id == Some(parent) && !result.contains(&node.id) {
                result.insert(node.id);
                stack.push(node.id);
            }
        }
    }
    result
}

fn print_tree(nodes: &[outline_core::data::Node], parent_id: Option<uuid::Uuid>, depth: usize, max_depth: Option<usize>, prefix: &str) {
    if let Some(max) = max_depth {
        if depth > max {
            return;
        }
    }

    let mut children: Vec<_> = nodes.iter()
        .filter(|n| n.parent_id == parent_id)
        .collect();
    children.sort_by_key(|n| n.position);

    for node in children {
        let indent = "  ".repeat(depth);
        let content = strip_html(&node.content);
        let marker = match node.node_type {
            outline_core::data::NodeType::Checkbox if node.is_checked => "☑",
            outline_core::data::NodeType::Checkbox => "☐",
            outline_core::data::NodeType::Heading => "#",
            outline_core::data::NodeType::Bullet => "•",
        };
        let sid = node.short_id.as_deref().unwrap_or("????");

        println!("{}{}-{} {} {}", indent, prefix, sid, marker, content);

        if let Some(ref note) = node.note {
            let note_indent = "  ".repeat(depth + 1);
            for line in note.lines() {
                println!("{}          {}", note_indent, line);
            }
        }

        print_tree(nodes, Some(node.id), depth + 1, max_depth, prefix);
    }
}

fn cmd_doc_delete(_out: &OutputMode, id: &str) -> Result<(), String> {
    use outline_core::data::documents_dir;

    let doc_uuid = resolve_doc_ref(id)?;
    let doc_dir = documents_dir().join(doc_uuid.to_string());
    if !doc_dir.exists() {
        return Err(format!("Document not found: {}", id));
    }

    std::fs::remove_dir_all(&doc_dir)
        .map_err(|e| format!("Failed to delete document: {}", e))?;

    eprintln!("Deleted document {}", doc_uuid);
    Ok(())
}

// -- Node commands --

fn cmd_node_create(out: &OutputMode, doc_id: &str, parent_uuid: uuid::Uuid, content: &str, position: Option<i32>, node_type: &str, note: Option<&str>) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document, NodeType, NodeChanges, create_op_with_id, update_op};

    let doc_dir = documents_dir().join(doc_id);
    let mut doc = Document::load(doc_dir)?;

    let pos = position.unwrap_or_else(|| {
        doc.state.nodes.iter()
            .filter(|n| n.parent_id == Some(parent_uuid))
            .count() as i32
    });

    let nt = match node_type {
        "checkbox" => NodeType::Checkbox,
        "heading" => NodeType::Heading,
        _ => NodeType::Bullet,
    };

    let new_id = uuid::Uuid::now_v7();
    let op = create_op_with_id(new_id, Some(parent_uuid), pos, content.to_string(), nt);
    doc.append_op(&op)?;
    op.apply(&mut doc.state);

    // Apply note if provided
    if let Some(note_text) = note {
        let note_op = update_op(new_id, NodeChanges {
            note: Some(note_text.to_string()),
            ..Default::default()
        });
        doc.append_op(&note_op)?;
        note_op.apply(&mut doc.state);
    }

    if out.is_json() {
        let node = doc.state.nodes.iter().find(|n| n.id == new_id);
        out.print_json(&serde_json::json!({
            "id": new_id.to_string(),
            "node": node,
        }));
    } else {
        println!("{}", new_id);
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cmd_node_update(out: &OutputMode, doc_id: &str, node_uuid: uuid::Uuid, content: Option<String>, note: Option<String>, check: bool, uncheck: bool, node_type: Option<String>, color: Option<String>, date: Option<String>, date_end: Option<String>) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document, NodeType, NodeChanges, update_op};

    let doc_dir = documents_dir().join(doc_id);
    let mut doc = Document::load(doc_dir)?;

    let mut changes = NodeChanges::default();
    changes.content = content;
    changes.note = note;
    if check { changes.is_checked = Some(true); }
    if uncheck { changes.is_checked = Some(false); }
    changes.node_type = node_type.map(|t| match t.as_str() {
        "checkbox" => NodeType::Checkbox,
        "heading" => NodeType::Heading,
        _ => NodeType::Bullet,
    });
    changes.color = color;
    changes.date = date;
    changes.date_end = date_end;

    let op = update_op(node_uuid, changes);
    doc.append_op(&op)?;
    op.apply(&mut doc.state);

    if out.is_json() {
        let node = doc.state.nodes.iter().find(|n| n.id == node_uuid);
        out.print_json(&serde_json::json!({ "node": node }));
    } else {
        eprintln!("Updated node {}", node_uuid);
    }

    Ok(())
}

fn cmd_node_move(out: &OutputMode, doc_id: &str, node_uuid: uuid::Uuid, parent_uuid: uuid::Uuid, position: i32) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document, move_op};

    let doc_dir = documents_dir().join(doc_id);
    let mut doc = Document::load(doc_dir)?;

    let op = move_op(node_uuid, Some(parent_uuid), position);
    doc.append_op(&op)?;
    op.apply(&mut doc.state);

    if out.is_json() {
        out.print_json(&serde_json::json!({ "moved": node_uuid.to_string(), "parent": parent_uuid.to_string(), "position": position }));
    } else {
        eprintln!("Moved node {} to parent {} at position {}", node_uuid, parent_uuid, position);
    }

    Ok(())
}

fn cmd_node_delete(out: &OutputMode, doc_id: &str, node_uuid: uuid::Uuid, force: bool) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document, delete_op};

    let doc_dir = documents_dir().join(doc_id);
    let mut doc = Document::load(doc_dir)?;

    // Count descendants
    let descendant_count = count_descendants(&doc.state.nodes, node_uuid);

    if !force && descendant_count > 0 {
        eprintln!("Node {} has {} descendants. Use --force to delete.", node_uuid, descendant_count);
        return Err(format!("Delete aborted: {} descendants would be removed", descendant_count));
    }

    let op = delete_op(node_uuid);
    doc.append_op(&op)?;
    op.apply(&mut doc.state);

    if out.is_json() {
        out.print_json(&serde_json::json!({ "deleted": node_uuid.to_string(), "descendants_removed": descendant_count }));
    } else {
        eprintln!("Deleted node {} ({} descendants)", node_uuid, descendant_count);
    }

    Ok(())
}

fn count_descendants(nodes: &[outline_core::data::Node], parent_id: uuid::Uuid) -> usize {
    let mut count = 0;
    let mut stack = vec![parent_id];
    while let Some(pid) = stack.pop() {
        for node in nodes {
            if node.parent_id == Some(pid) {
                count += 1;
                stack.push(node.id);
            }
        }
    }
    count
}

// -- Search commands --

fn cmd_search(out: &OutputMode, query: &str, doc_id: Option<&str>, limit: usize) -> Result<(), String> {
    use outline_core::search::SearchIndex;

    let index = SearchIndex::open().map_err(|e| format!("Failed to open search index: {}", e))?;

    let doc_uuid = doc_id
        .map(|id| resolve_doc_ref(id))
        .transpose()?;

    let results = index.search(query, doc_uuid.as_ref(), limit)
        .map_err(|e| format!("Search failed: {}", e))?;

    if out.is_json() {
        out.print_json(&serde_json::json!(results));
    } else {
        if results.is_empty() {
            println!("No results found.");
        } else {
            for result in &results {
                let snippet = strip_html(&result.snippet);
                println!("{}  (doc: {})", result.node_id, result.document_id);
                println!("  {}", snippet);
                println!();
            }
        }
    }

    Ok(())
}

fn cmd_backlinks(out: &OutputMode, node_id: &str) -> Result<(), String> {
    use outline_core::search::SearchIndex;

    let index = SearchIndex::open().map_err(|e| format!("Failed to open search index: {}", e))?;
    let node_uuid = uuid::Uuid::parse_str(node_id)
        .map_err(|e| format!("Invalid node ID: {}", e))?;

    let results = index.get_backlinks(&node_uuid)
        .map_err(|e| format!("Backlinks query failed: {}", e))?;

    if out.is_json() {
        out.print_json(&serde_json::json!(results));
    } else {
        if results.is_empty() {
            println!("No backlinks found.");
        } else {
            for result in &results {
                let content = strip_html(&result.content);
                println!("{} (doc: {})", result.source_node_id, result.source_document_id);
                println!("  {}", content);
                println!();
            }
        }
    }

    Ok(())
}

// -- Inbox commands --

fn cmd_inbox_list(out: &OutputMode) -> Result<(), String> {
    let items = outline_core::data::read_inbox()?;

    if out.is_json() {
        out.print_json(&serde_json::json!(items));
    } else {
        if items.is_empty() {
            println!("Inbox is empty.");
        } else {
            for item in &items {
                println!("[{}] {} ({})", item.id, item.content, item.captured_at);
                if let Some(ref note) = item.note {
                    println!("  Note: {}", note);
                }
            }
        }
    }

    Ok(())
}

fn cmd_inbox_import(_out: &OutputMode) -> Result<(), String> {
    Err("inbox import not yet implemented".to_string())
}

fn cmd_inbox_clear(_out: &OutputMode, ids: &[String]) -> Result<(), String> {
    outline_core::data::remove_inbox_items(ids)?;
    eprintln!("Cleared {} inbox items.", ids.len());
    Ok(())
}

// -- Folder commands --

fn cmd_folder_list(out: &OutputMode) -> Result<(), String> {
    let state = outline_core::data::load_folders()?;

    if out.is_json() {
        out.print_json(&serde_json::json!(state));
    } else {
        if state.folders.is_empty() {
            println!("No folders.");
        } else {
            for folder in &state.folders {
                let doc_count = state.document_order
                    .get(&folder.id)
                    .map(|v| v.len())
                    .unwrap_or(0);
                println!("{} {} ({} docs)", folder.id, folder.name, doc_count);
            }
        }
    }

    Ok(())
}

fn cmd_folder_create(out: &OutputMode, name: &str) -> Result<(), String> {
    let folder = outline_core::data::create_folder(name)?;

    if out.is_json() {
        out.print_json(&serde_json::json!(folder));
    } else {
        println!("{}", folder.id);
    }

    Ok(())
}

fn cmd_folder_delete(_out: &OutputMode, id: &str) -> Result<(), String> {
    outline_core::data::delete_folder(id)?;
    eprintln!("Deleted folder {}", id);
    Ok(())
}

fn cmd_folder_move_doc(_out: &OutputMode, doc_id: &str, folder_id: Option<&str>, position: Option<i32>) -> Result<(), String> {
    outline_core::data::move_document_to_folder(doc_id, folder_id, position)?;
    eprintln!("Moved document {} to folder {}", doc_id, folder_id.unwrap_or("root"));
    Ok(())
}

// -- Export commands --

fn cmd_export_opml(_out: &OutputMode, doc_id: &str) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document};

    let doc_dir = documents_dir().join(doc_id);
    let doc = Document::load(doc_dir)?;

    let title = doc.state.nodes.iter()
        .find(|n| n.parent_id.is_none())
        .map(|n| strip_html(&n.content))
        .unwrap_or_else(|| "Outline Document".to_string());

    let opml = outline_core::import_export::generate_opml(&doc.state.nodes, &title)?;
    print!("{}", opml);
    Ok(())
}

fn cmd_export_markdown(_out: &OutputMode, doc_id: &str) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document};

    let doc_dir = documents_dir().join(doc_id);
    let doc = Document::load(doc_dir)?;

    let md = outline_core::import_export::generate_markdown(&doc.state.nodes);
    print!("{}", md);
    Ok(())
}

fn cmd_export_json(_out: &OutputMode, doc_id: &str) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document};

    let doc_dir = documents_dir().join(doc_id);
    let doc = Document::load(doc_dir)?;

    let json = outline_core::import_export::generate_json_backup(&doc.state.nodes)?;
    print!("{}", json);
    Ok(())
}

// -- Import commands --

fn cmd_import_opml(out: &OutputMode, file: &std::path::Path) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document, ensure_dirs};

    let content = std::fs::read_to_string(file)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let nodes = outline_core::import_export::parse_opml(&content)?;

    ensure_dirs()?;
    let doc_id = uuid::Uuid::now_v7();
    let doc_dir = documents_dir().join(doc_id.to_string());
    let mut doc = Document::create(doc_dir)?;
    doc.state.nodes = nodes;
    doc.save_state()?;

    if out.is_json() {
        out.print_json(&serde_json::json!({
            "id": doc_id.to_string(),
            "node_count": doc.state.nodes.len(),
        }));
    } else {
        println!("{}", doc_id);
    }

    Ok(())
}

fn cmd_import_json(out: &OutputMode, file: &std::path::Path) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document, ensure_dirs};

    let content = std::fs::read_to_string(file)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let nodes = outline_core::import_export::parse_json_backup(&content)?;

    ensure_dirs()?;
    let doc_id = uuid::Uuid::now_v7();
    let doc_dir = documents_dir().join(doc_id.to_string());
    let mut doc = Document::create(doc_dir)?;
    doc.state.nodes = nodes;
    doc.save_state()?;

    if out.is_json() {
        out.print_json(&serde_json::json!({
            "id": doc_id.to_string(),
            "node_count": doc.state.nodes.len(),
        }));
    } else {
        println!("{}", doc_id);
    }

    Ok(())
}

// -- Compact command --

fn cmd_compact(out: &OutputMode, doc_id: &str) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document};

    let doc_dir = documents_dir().join(doc_id);
    let mut doc = Document::load(doc_dir)?;

    let before = doc.pending_op_count;
    doc.compact()?;

    if out.is_json() {
        out.print_json(&serde_json::json!({
            "document_id": doc_id,
            "pending_ops_merged": before,
        }));
    } else {
        eprintln!("Compacted document {} ({} pending ops merged)", doc_id, before);
    }

    Ok(())
}

// -- Capture commands --

fn cmd_capture(out: &OutputMode, content_args: Vec<String>, to: Option<&str>, note: Option<&str>, node_type: &str, stdin: bool) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document, NodeType, NodeChanges, create_op_with_id, update_op, get_capture_target};
    use outline_core::data::short_ids;

    // Get items: each arg is a separate item, stdin is one item
    let items: Vec<String> = if stdin {
        use std::io::Read;
        let mut buf = String::new();
        std::io::stdin().read_to_string(&mut buf)
            .map_err(|e| format!("Read stdin: {}", e))?;
        let trimmed = buf.trim().to_string();
        if trimmed.is_empty() { vec![] } else { vec![trimmed] }
    } else {
        content_args.into_iter().filter(|s| !s.is_empty()).collect()
    };

    if items.is_empty() {
        return Err("No content to capture. Provide text or use --stdin.".to_string());
    }

    // Resolve target
    let (target_name, target) = get_capture_target(to)
        .ok_or_else(|| {
            if let Some(name) = to {
                format!("Capture target '{}' not found. Run 'outline target list'.", name)
            } else {
                "No default capture target configured. Run 'otl target add <name> --doc <id>'.".to_string()
            }
        })?;

    // Load document and create nodes directly
    let doc_dir = documents_dir().join(&target.document_id);
    if !doc_dir.exists() {
        return Err(format!("Target document {} not found", target.document_id));
    }

    let mut doc = Document::load(doc_dir)?;

    let parent_uuid = uuid::Uuid::parse_str(&target.node_id)
        .map_err(|e| format!("Invalid target node ID: {}", e))?;

    let nt = match node_type {
        "checkbox" => NodeType::Checkbox,
        "heading" => NodeType::Heading,
        _ => NodeType::Bullet,
    };

    // Create a node per item
    let mut created: Vec<(uuid::Uuid, i32, String)> = Vec::new();
    for item in &items {
        let position = doc.state.nodes.iter()
            .filter(|n| n.parent_id == Some(parent_uuid))
            .count() as i32;

        let new_id = uuid::Uuid::now_v7();
        let op = create_op_with_id(new_id, Some(parent_uuid), position, item.clone(), nt.clone());
        doc.append_op(&op)?;
        op.apply(&mut doc.state);
        created.push((new_id, position, item.clone()));
    }

    // Apply note to the last created node
    if let Some(note_text) = note {
        if let Some((last_id, _, _)) = created.last() {
            let note_op = update_op(*last_id, NodeChanges {
                note: Some(note_text.to_string()),
                ..Default::default()
            });
            doc.append_op(&note_op)?;
            note_op.apply(&mut doc.state);
        }
    }

    // Assign short IDs to all nodes (including newly created)
    let prefix = short_ids::ensure_short_ids(&mut doc)?;

    // Output
    if out.is_json() {
        let results: Vec<serde_json::Value> = created.iter().map(|(id, pos, content)| {
            let sid = doc.state.nodes.iter()
                .find(|n| n.id == *id)
                .and_then(|n| n.short_id.as_deref())
                .unwrap_or("????");
            serde_json::json!({
                "id": id.to_string(),
                "short_id": format!("{}-{}", prefix, sid),
                "document_id": target.document_id,
                "position": pos,
                "target": target_name,
                "content": content,
            })
        }).collect();

        if results.len() == 1 {
            out.print_json(&results[0]);
        } else {
            out.print_json(&serde_json::json!(results));
        }
    } else {
        for (id, _, _) in &created {
            let sid = doc.state.nodes.iter()
                .find(|n| n.id == *id)
                .and_then(|n| n.short_id.as_deref())
                .unwrap_or("????");
            println!("{}-{}", prefix, sid);
        }
        eprintln!("Captured {} item(s) to '{}'", created.len(), target_name);
    }

    Ok(())
}

// -- Target commands --

fn cmd_target_list(out: &OutputMode) -> Result<(), String> {
    let targets = outline_core::data::get_capture_targets();

    if out.is_json() {
        out.print_json(&serde_json::json!(targets));
    } else if targets.is_empty() {
        println!("No capture targets configured.");
        println!("Add one with: otl target add <name> --doc <doc-id>");
    } else {
        println!("{:<14} {:<7} {:<38} {}", "Name", "Default", "Document", "Node");
        println!("{}", "-".repeat(80));
        for (name, target) in &targets {
            let default_marker = if target.default { "*" } else { "" };
            println!("{:<14} {:<7} {:<38} {}",
                name,
                default_marker,
                target.document_id,
                target.node_id,
            );
        }
    }

    Ok(())
}

fn cmd_target_add(out: &OutputMode, name: &str, doc: Option<&str>, node: Option<&str>, active_doc: &Option<String>) -> Result<(), String> {
    use outline_core::data::{documents_dir, Document};

    let (doc_uuid, node_uuid) = match (doc, node) {
        // Both provided
        (Some(d), Some(n)) => {
            let doc_id = resolve_doc_ref(d)?;
            let node_id = uuid::Uuid::parse_str(n)
                .or_else(|_| resolve_node_ref(n, active_doc).map(|(_, nid)| nid))
                .map_err(|_| format!("Cannot resolve node '{}'", n))?;
            (doc_id, node_id)
        }
        // Only doc: use document root node
        (Some(d), None) => {
            let doc_id = resolve_doc_ref(d)?;
            let doc_dir = documents_dir().join(doc_id.to_string());
            let doc = Document::load(doc_dir)?;
            let root = doc.state.nodes.iter()
                .find(|n| n.parent_id.is_none())
                .ok_or_else(|| "Document has no root node".to_string())?;
            (doc_id, root.id)
        }
        // Only node: infer document from node ref
        (None, Some(n)) => {
            let (doc_id_str, node_id) = resolve_node_ref(n, active_doc)?;
            let doc_id = uuid::Uuid::parse_str(&doc_id_str)
                .map_err(|e| format!("Invalid document ID: {}", e))?;
            (doc_id, node_id)
        }
        // Neither
        (None, None) => {
            return Err("Provide --doc, --node, or both. Examples:\n  otl target add inbox --doc mydoc\n  otl target add inbox --node mydoc-a3x".to_string());
        }
    };

    let target = outline_core::data::set_capture_target(name, doc_uuid.to_string(), node_uuid.to_string())?;

    if out.is_json() {
        out.print_json(&serde_json::json!({
            "name": name,
            "target": target,
        }));
    } else {
        eprintln!("Added capture target '{}'", name);
        if target.default {
            eprintln!("  (set as default)");
        }
    }

    Ok(())
}

fn cmd_target_remove(out: &OutputMode, name: &str) -> Result<(), String> {
    outline_core::data::remove_capture_target(name)?;

    if out.is_json() {
        out.print_json(&serde_json::json!({ "removed": name }));
    } else {
        eprintln!("Removed capture target '{}'", name);
    }

    Ok(())
}

fn cmd_target_set_default(out: &OutputMode, name: &str) -> Result<(), String> {
    outline_core::data::set_default_capture_target(name)?;

    if out.is_json() {
        out.print_json(&serde_json::json!({ "default": name }));
    } else {
        eprintln!("Set '{}' as default capture target", name);
    }

    Ok(())
}

// -- Utilities --

fn strip_html(html: &str) -> String {
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
}
