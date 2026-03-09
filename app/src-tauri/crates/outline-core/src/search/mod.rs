pub mod query_parser;

use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

use crate::data::{data_dir, Node, NodeType};
use query_parser::parse_query;

/// Search result returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub node_id: String,
    pub document_id: String,
    pub content: String,
    pub note: Option<String>,
    pub snippet: String,
    pub rank: f64,
}

/// Manages the SQLite FTS5 search index
pub struct SearchIndex {
    conn: Mutex<Connection>,
}

impl SearchIndex {
    /// Get the path to the SQLite database
    /// Uses platform cache directory (~/Library/Caches on macOS) to keep
    /// the data directory clean for syncing via Nextcloud/Dropbox/etc.
    fn db_path() -> PathBuf {
        dirs::cache_dir()
            .unwrap_or_else(|| data_dir())
            .join("outline")
            .join("outline.db")
    }

    /// Open or create the search index database
    pub fn open() -> SqliteResult<Self> {
        let db_path = Self::db_path();

        // Ensure cache directory exists
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(&db_path)?;

        // Create tables if they don't exist
        conn.execute_batch(
            r#"
            -- Main nodes table for metadata
            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                parent_id TEXT,
                depth INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                note TEXT,
                tags TEXT,
                created_at TEXT,
                updated_at TEXT
            );

            -- FTS5 virtual table for full-text search
            CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
                id,
                document_id,
                content,
                note,
                tags,
                content='nodes',
                content_rowid='rowid'
            );

            -- Triggers to keep FTS index in sync
            CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
                INSERT INTO nodes_fts(rowid, id, document_id, content, note, tags)
                VALUES (new.rowid, new.id, new.document_id, new.content, new.note, new.tags);
            END;

            CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
                INSERT INTO nodes_fts(nodes_fts, rowid, id, document_id, content, note, tags)
                VALUES ('delete', old.rowid, old.id, old.document_id, old.content, old.note, old.tags);
            END;

            CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
                INSERT INTO nodes_fts(nodes_fts, rowid, id, document_id, content, note, tags)
                VALUES ('delete', old.rowid, old.id, old.document_id, old.content, old.note, old.tags);
                INSERT INTO nodes_fts(rowid, id, document_id, content, note, tags)
                VALUES (new.rowid, new.id, new.document_id, new.content, new.note, new.tags);
            END;

            -- Index for filtering by document
            CREATE INDEX IF NOT EXISTS idx_nodes_document ON nodes(document_id);

            -- Links table for backlinks tracking
            CREATE TABLE IF NOT EXISTS links (
                source_node_id TEXT NOT NULL,
                target_node_id TEXT NOT NULL,
                source_document_id TEXT NOT NULL,
                PRIMARY KEY (source_node_id, target_node_id)
            );

            -- Index for finding backlinks
            CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_node_id);
            "#,
        )?;

        // Migration: add depth column if it doesn't exist (for existing databases)
        // SQLite doesn't have ALTER TABLE ADD COLUMN IF NOT EXISTS, so we check first
        let has_depth: bool = conn
            .prepare("SELECT depth FROM nodes LIMIT 1")
            .is_ok();
        if !has_depth {
            conn.execute("ALTER TABLE nodes ADD COLUMN depth INTEGER NOT NULL DEFAULT 0", [])?;
        }

        // Migration: add columns for search operators
        Self::migrate_add_column(&conn, "node_type", "TEXT DEFAULT 'bullet'")?;
        Self::migrate_add_column(&conn, "is_checked", "INTEGER DEFAULT 0")?;
        Self::migrate_add_column(&conn, "color", "TEXT")?;
        Self::migrate_add_column(&conn, "date", "TEXT")?;
        Self::migrate_add_column(&conn, "children_count", "INTEGER DEFAULT 0")?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Add a column to the nodes table if it doesn't already exist.
    fn migrate_add_column(conn: &Connection, column: &str, definition: &str) -> SqliteResult<()> {
        let check_sql = format!("SELECT {} FROM nodes LIMIT 1", column);
        if conn.prepare(&check_sql).is_err() {
            let alter_sql = format!("ALTER TABLE nodes ADD COLUMN {} {}", column, definition);
            conn.execute(&alter_sql, [])?;
        }
        Ok(())
    }

    /// Index a document's nodes (replaces any existing entries for that document)
    pub fn index_document(&self, document_id: &Uuid, nodes: &[Node]) -> SqliteResult<()> {
        let mut conn = self.conn.lock().unwrap();
        let doc_id_str = document_id.to_string();

        // Use a transaction for bulk inserts (massive performance improvement)
        let tx = conn.transaction()?;

        // Delete existing entries for this document
        tx.execute(
            "DELETE FROM nodes WHERE document_id = ?",
            params![doc_id_str],
        )?;

        // Build a map of node_id -> node for depth calculation
        let node_map: HashMap<_, _> = nodes
            .iter()
            .map(|n| (n.id, n))
            .collect();

        // Compute children counts
        let mut children_count: HashMap<Uuid, i32> = HashMap::new();
        for node in nodes {
            if let Some(parent_id) = node.parent_id {
                *children_count.entry(parent_id).or_insert(0) += 1;
            }
        }

        // Compute depth for a node (memoized via cache)
        fn compute_depth(
            node_id: Uuid,
            node_map: &HashMap<Uuid, &Node>,
            depth_cache: &mut HashMap<Uuid, i32>,
        ) -> i32 {
            if let Some(&cached) = depth_cache.get(&node_id) {
                return cached;
            }
            let depth = match node_map.get(&node_id) {
                Some(node) => match node.parent_id {
                    Some(parent_id) => 1 + compute_depth(parent_id, node_map, depth_cache),
                    None => 0,
                },
                None => 0,
            };
            depth_cache.insert(node_id, depth);
            depth
        }

        let mut depth_cache = HashMap::new();

        // Insert new entries
        {
            let mut stmt = tx.prepare(
                r#"
                INSERT INTO nodes (id, document_id, parent_id, depth, content, note, tags,
                    created_at, updated_at, node_type, is_checked, color, date, children_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )?;

            for node in nodes {
                let tags_str = if node.tags.is_empty() {
                    None
                } else {
                    Some(node.tags.join(" "))
                };

                let depth = compute_depth(node.id, &node_map, &mut depth_cache);
                let node_type_str = node_type_to_str(&node.node_type);
                let child_count = children_count.get(&node.id).copied().unwrap_or(0);

                stmt.execute(params![
                    node.id.to_string(),
                    doc_id_str,
                    node.parent_id.map(|id| id.to_string()),
                    depth,
                    strip_html(&node.content),
                    node.note,
                    tags_str,
                    node.created_at.to_rfc3339(),
                    node.updated_at.to_rfc3339(),
                    node_type_str,
                    node.is_checked as i32,
                    node.color,
                    node.date,
                    child_count,
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    /// Search for nodes matching a query, with support for structured operators.
    ///
    /// The query string can contain:
    /// - Plain text terms (passed to FTS5)
    /// - `is:completed`, `is:heading`, etc. (structural filters)
    /// - `has:date`, `has:note`, `has:children`, `has:color` (presence filters)
    /// - `color:red` (value filters)
    /// - `in:title`, `in:note` (scope filters)
    /// - `edited:today`, `created:-7d` (date range filters)
    /// - `OR`, `-term`, `"exact phrase"` (boolean operators)
    pub fn search(
        &self,
        query: &str,
        document_id: Option<&Uuid>,
        limit: usize,
    ) -> SqliteResult<Vec<SearchResult>> {
        let conn = self.conn.lock().unwrap();

        let parsed = parse_query(query);
        let has_text = parsed.has_text();
        let has_filters = !parsed.filters.is_empty();

        // If no text and no filters, return empty
        if !has_text && !has_filters {
            return Ok(Vec::new());
        }

        let (filter_clauses, filter_params) = parsed.to_sql_filters();

        // Build the query dynamically
        let results = if has_text {
            // FTS search + optional filters
            let fts_query = parsed.to_fts_query();
            self.search_with_fts(&conn, &fts_query, &filter_clauses, &filter_params, document_id, limit)?
        } else {
            // Filter-only search (no FTS needed)
            self.search_filters_only(&conn, &filter_clauses, &filter_params, document_id, limit)?
        };

        Ok(results)
    }

    /// Execute a search that combines FTS5 with SQL filters.
    fn search_with_fts(
        &self,
        conn: &Connection,
        fts_query: &str,
        filter_clauses: &[String],
        filter_params: &[String],
        document_id: Option<&Uuid>,
        limit: usize,
    ) -> SqliteResult<Vec<SearchResult>> {
        let mut where_parts = vec!["nodes_fts MATCH ?".to_string()];
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        params_vec.push(Box::new(fts_query.to_string()));

        if let Some(doc_id) = document_id {
            where_parts.push("n.document_id = ?".to_string());
            params_vec.push(Box::new(doc_id.to_string()));
        }

        for clause in filter_clauses {
            where_parts.push(clause.clone());
        }
        for param in filter_params {
            params_vec.push(Box::new(param.clone()));
        }

        params_vec.push(Box::new(limit as i64));

        let where_clause = where_parts.join(" AND ");

        let sql = format!(
            r#"
            SELECT
                n.id,
                n.document_id,
                n.content,
                n.note,
                snippet(nodes_fts, 2, '<mark>', '</mark>', '...', 32) as snippet,
                bm25(nodes_fts) as rank
            FROM nodes_fts
            JOIN nodes n ON nodes_fts.id = n.id
            WHERE {}
            ORDER BY n.depth ASC, rank ASC
            LIMIT ?
            "#,
            where_clause
        );

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(SearchResult {
                node_id: row.get(0)?,
                document_id: row.get(1)?,
                content: row.get(2)?,
                note: row.get(3)?,
                snippet: row.get(4)?,
                rank: row.get(5)?,
            })
        })?;

        let mut results = Vec::new();
        for result in rows {
            if let Ok(r) = result {
                results.push(r);
            }
        }

        Ok(results)
    }

    /// Execute a filter-only search (no FTS text matching).
    fn search_filters_only(
        &self,
        conn: &Connection,
        filter_clauses: &[String],
        filter_params: &[String],
        document_id: Option<&Uuid>,
        limit: usize,
    ) -> SqliteResult<Vec<SearchResult>> {
        let mut where_parts: Vec<String> = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(doc_id) = document_id {
            where_parts.push("n.document_id = ?".to_string());
            params_vec.push(Box::new(doc_id.to_string()));
        }

        for clause in filter_clauses {
            where_parts.push(clause.clone());
        }
        for param in filter_params {
            params_vec.push(Box::new(param.clone()));
        }

        params_vec.push(Box::new(limit as i64));

        let where_clause = if where_parts.is_empty() {
            "1=1".to_string()
        } else {
            where_parts.join(" AND ")
        };

        let sql = format!(
            r#"
            SELECT
                n.id,
                n.document_id,
                n.content,
                n.note,
                SUBSTR(n.content, 1, 100) as snippet,
                0.0 as rank
            FROM nodes n
            WHERE {}
            ORDER BY n.depth ASC, n.updated_at DESC
            LIMIT ?
            "#,
            where_clause
        );

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(SearchResult {
                node_id: row.get(0)?,
                document_id: row.get(1)?,
                content: row.get(2)?,
                note: row.get(3)?,
                snippet: row.get(4)?,
                rank: row.get(5)?,
            })
        })?;

        let mut results = Vec::new();
        for result in rows {
            if let Ok(r) = result {
                results.push(r);
            }
        }

        Ok(results)
    }

    /// Update a single node in the index
    pub fn update_node(&self, document_id: &Uuid, node: &Node) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        let tags_str = if node.tags.is_empty() {
            None
        } else {
            Some(node.tags.join(" "))
        };

        let node_type_str = node_type_to_str(&node.node_type);

        conn.execute(
            r#"
            INSERT OR REPLACE INTO nodes (id, document_id, parent_id, content, note, tags,
                created_at, updated_at, node_type, is_checked, color, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            params![
                node.id.to_string(),
                document_id.to_string(),
                node.parent_id.map(|id| id.to_string()),
                strip_html(&node.content),
                node.note,
                tags_str,
                node.created_at.to_rfc3339(),
                node.updated_at.to_rfc3339(),
                node_type_str,
                node.is_checked as i32,
                node.color,
                node.date,
            ],
        )?;

        Ok(())
    }

    /// Delete a node from the index
    pub fn delete_node(&self, node_id: &Uuid) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM nodes WHERE id = ?", params![node_id.to_string()])?;
        Ok(())
    }

    /// Clear all data from the index
    #[allow(dead_code)]
    pub fn clear(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM nodes", [])?;
        Ok(())
    }

    /// Update links for a node by extracting wiki-links from content
    pub fn update_links(&self, document_id: &Uuid, node: &Node) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        let node_id_str = node.id.to_string();
        let doc_id_str = document_id.to_string();

        // Delete existing links from this node
        conn.execute(
            "DELETE FROM links WHERE source_node_id = ?",
            params![node_id_str],
        )?;

        // Extract wiki-links from content
        let links = extract_wiki_links(&node.content);

        // Insert new links
        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO links (source_node_id, target_node_id, source_document_id) VALUES (?, ?, ?)",
        )?;

        for target_id in links {
            stmt.execute(params![node_id_str, target_id, doc_id_str])?;
        }

        Ok(())
    }

    /// Update links for all nodes in a document
    pub fn update_document_links(&self, document_id: &Uuid, nodes: &[Node]) -> SqliteResult<()> {
        let mut conn = self.conn.lock().unwrap();
        let doc_id_str = document_id.to_string();

        // Use a transaction for bulk operations
        let tx = conn.transaction()?;

        // Delete existing links from this document
        tx.execute(
            "DELETE FROM links WHERE source_document_id = ?",
            params![doc_id_str],
        )?;

        // Insert new links
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO links (source_node_id, target_node_id, source_document_id) VALUES (?, ?, ?)",
            )?;

            for node in nodes {
                let node_id_str = node.id.to_string();
                let links = extract_wiki_links(&node.content);

                for target_id in links {
                    stmt.execute(params![node_id_str, target_id, doc_id_str])?;
                }
            }
        }

        tx.commit()?;
        Ok(())
    }

    /// Get backlinks (nodes that link to the given node)
    pub fn get_backlinks(&self, target_node_id: &Uuid) -> SqliteResult<Vec<BacklinkResult>> {
        let conn = self.conn.lock().unwrap();
        let target_id_str = target_node_id.to_string();

        let mut stmt = conn.prepare(
            r#"
            SELECT l.source_node_id, l.source_document_id, n.content
            FROM links l
            LEFT JOIN nodes n ON l.source_node_id = n.id
            WHERE l.target_node_id = ?
            "#,
        )?;

        let rows = stmt.query_map(params![target_id_str], |row| {
            Ok(BacklinkResult {
                source_node_id: row.get(0)?,
                source_document_id: row.get(1)?,
                content: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            })
        })?;

        let mut results = Vec::new();
        for result in rows {
            if let Ok(r) = result {
                results.push(r);
            }
        }

        Ok(results)
    }
    /// Find unlinked references: nodes that mention search_text but don't have
    /// a formal wiki link to the target node
    pub fn get_unlinked_references(
        &self,
        target_node_id: &Uuid,
        search_text: &str,
    ) -> SqliteResult<Vec<UnlinkedReference>> {
        let conn = self.conn.lock().unwrap();
        let target_id_str = target_node_id.to_string();
        let search_lower = search_text.to_lowercase();

        // Find nodes containing the text (case-insensitive) that:
        // 1. Are not the target node itself
        // 2. Don't already have a formal wiki link to the target node
        let mut stmt = conn.prepare(
            r#"
            SELECT n.id, n.document_id, n.content
            FROM nodes n
            WHERE LOWER(n.content) LIKE '%' || ? || '%'
            AND n.id != ?
            AND NOT EXISTS (
                SELECT 1 FROM links l
                WHERE l.source_node_id = n.id
                AND l.target_node_id = ?
            )
            LIMIT 50
            "#,
        )?;

        let rows = stmt.query_map(params![search_lower, target_id_str, target_id_str], |row| {
            Ok(UnlinkedReference {
                source_node_id: row.get(0)?,
                source_document_id: row.get(1)?,
                content: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            })
        })?;

        let mut results = Vec::new();
        for result in rows {
            if let Ok(r) = result {
                results.push(r);
            }
        }

        Ok(results)
    }
}

/// Backlink result returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacklinkResult {
    pub source_node_id: String,
    pub source_document_id: String,
    pub content: String,
}

/// Unlinked reference result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlinkedReference {
    pub source_node_id: String,
    pub source_document_id: String,
    pub content: String,
}

/// Convert a NodeType enum to its string representation for storage.
fn node_type_to_str(node_type: &NodeType) -> &'static str {
    match node_type {
        NodeType::Bullet => "bullet",
        NodeType::Checkbox => "checkbox",
        NodeType::Heading => "heading",
        NodeType::Numbered => "numbered",
    }
}

/// Extract wiki-link target IDs from HTML content
fn extract_wiki_links(html: &str) -> Vec<String> {
    let mut links = Vec::new();

    // Look for data-node-id attributes in wiki-link spans
    // Pattern: data-node-id="uuid"
    let mut i = 0;
    let bytes = html.as_bytes();
    let pattern = b"data-node-id=\"";

    while i < bytes.len() {
        if bytes[i..].starts_with(pattern) {
            i += pattern.len();
            let start = i;

            // Find closing quote
            while i < bytes.len() && bytes[i] != b'"' {
                i += 1;
            }

            if i > start {
                if let Ok(node_id) = std::str::from_utf8(&bytes[start..i]) {
                    links.push(node_id.to_string());
                }
            }
        } else {
            i += 1;
        }
    }

    links
}

/// Strip HTML tags from content for indexing
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

    // Decode common HTML entities
    result
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
}

/// Escape a query string for FTS5 matching (legacy, used by tests)
#[allow(dead_code)]
fn escape_fts_query(query: &str) -> String {
    // If query contains special FTS5 characters, wrap terms in quotes
    // Otherwise, use prefix matching with *
    let terms: Vec<&str> = query.split_whitespace().collect();

    if terms.is_empty() {
        return String::new();
    }

    terms
        .iter()
        .map(|term| {
            // Escape quotes and add prefix wildcard for partial matching
            let escaped = term.replace('"', "\"\"");
            format!("\"{}\"*", escaped)
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::Node;
    use tempfile::TempDir;

    fn setup_test_index() -> (TempDir, SearchIndex) {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("test.db");

        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                parent_id TEXT,
                depth INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                note TEXT,
                tags TEXT,
                created_at TEXT,
                updated_at TEXT,
                node_type TEXT DEFAULT 'bullet',
                is_checked INTEGER DEFAULT 0,
                color TEXT,
                date TEXT,
                children_count INTEGER DEFAULT 0
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
                id,
                document_id,
                content,
                note,
                tags,
                content='nodes',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
                INSERT INTO nodes_fts(rowid, id, document_id, content, note, tags)
                VALUES (new.rowid, new.id, new.document_id, new.content, new.note, new.tags);
            END;

            CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
                INSERT INTO nodes_fts(nodes_fts, rowid, id, document_id, content, note, tags)
                VALUES ('delete', old.rowid, old.id, old.document_id, old.content, old.note, old.tags);
            END;

            CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
                INSERT INTO nodes_fts(nodes_fts, rowid, id, document_id, content, note, tags)
                VALUES ('delete', old.rowid, old.id, old.document_id, old.content, old.note, old.tags);
                INSERT INTO nodes_fts(rowid, id, document_id, content, note, tags)
                VALUES (new.rowid, new.id, new.document_id, new.content, new.note, new.tags);
            END;

            CREATE INDEX IF NOT EXISTS idx_nodes_document ON nodes(document_id);
            "#,
        )
        .unwrap();

        let index = SearchIndex {
            conn: Mutex::new(conn),
        };

        (tmp, index)
    }

    #[test]
    fn test_strip_html() {
        assert_eq!(strip_html("<p>Hello</p>"), "Hello");
        assert_eq!(strip_html("Hello <b>World</b>!"), "Hello World!");
        assert_eq!(strip_html("No tags here"), "No tags here");
        assert_eq!(strip_html("&amp; &lt; &gt;"), "& < >");
    }

    #[test]
    fn test_escape_fts_query() {
        assert_eq!(escape_fts_query("hello"), "\"hello\"*");
        assert_eq!(escape_fts_query("hello world"), "\"hello\"* \"world\"*");
        assert_eq!(escape_fts_query("test\"quote"), "\"test\"\"quote\"*");
    }

    #[test]
    fn test_index_and_search() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let nodes = vec![
            Node::new("Hello world".to_string()),
            Node::new("Goodbye world".to_string()),
            Node::new("Different content".to_string()),
        ];

        index.index_document(&doc_id, &nodes).unwrap();

        // Search for "world"
        let results = index.search("world", None, 10).unwrap();
        assert_eq!(results.len(), 2);

        // Search for "hello"
        let results = index.search("hello", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("Hello"));

        // Search for "different"
        let results = index.search("different", None, 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_search_within_document() {
        let (_tmp, index) = setup_test_index();
        let doc1_id = Uuid::new_v4();
        let doc2_id = Uuid::new_v4();

        let nodes1 = vec![Node::new("Apple pie recipe".to_string())];
        let nodes2 = vec![Node::new("Apple cider donuts".to_string())];

        index.index_document(&doc1_id, &nodes1).unwrap();
        index.index_document(&doc2_id, &nodes2).unwrap();

        // Global search should find both
        let results = index.search("apple", None, 10).unwrap();
        assert_eq!(results.len(), 2);

        // Document-scoped search should find only one
        let results = index.search("apple", Some(&doc1_id), 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("pie"));
    }

    #[test]
    fn test_search_is_completed() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let mut checked_node = Node::new("Buy groceries".to_string());
        checked_node.node_type = NodeType::Checkbox;
        checked_node.is_checked = true;

        let mut unchecked_node = Node::new("Clean house".to_string());
        unchecked_node.node_type = NodeType::Checkbox;

        let plain_node = Node::new("Some note".to_string());

        index.index_document(&doc_id, &[checked_node, unchecked_node, plain_node]).unwrap();

        // is:completed should find only the checked node
        let results = index.search("is:completed", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("groceries"));

        // is:completed + text search
        let results = index.search("is:completed groceries", None, 10).unwrap();
        assert_eq!(results.len(), 1);

        // -is:completed should find non-checked nodes
        let results = index.search("-is:completed house", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("house"));
    }

    #[test]
    fn test_search_is_heading() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let mut heading_node = Node::new("Project Overview".to_string());
        heading_node.node_type = NodeType::Heading;

        let plain_node = Node::new("Some detail".to_string());

        index.index_document(&doc_id, &[heading_node, plain_node]).unwrap();

        let results = index.search("is:heading", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("Overview"));
    }

    #[test]
    fn test_search_has_date() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let mut dated_node = Node::new("Meeting tomorrow".to_string());
        dated_node.date = Some("2026-03-10".to_string());

        let plain_node = Node::new("Some thought".to_string());

        index.index_document(&doc_id, &[dated_node, plain_node]).unwrap();

        let results = index.search("has:date", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("Meeting"));
    }

    #[test]
    fn test_search_has_note() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let mut node_with_note = Node::new("Important item".to_string());
        node_with_note.note = Some("This has details".to_string());

        let plain_node = Node::new("Simple item".to_string());

        index.index_document(&doc_id, &[node_with_note, plain_node]).unwrap();

        let results = index.search("has:note", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("Important"));
    }

    #[test]
    fn test_search_has_children() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let parent_node = Node::new("Parent item".to_string());
        let child_node = Node::new_child(parent_node.id, 0, "Child item".to_string());

        index.index_document(&doc_id, &[parent_node, child_node]).unwrap();

        let results = index.search("has:children", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("Parent"));
    }

    #[test]
    fn test_search_color_filter() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let mut red_node = Node::new("Urgent task".to_string());
        red_node.color = Some("red".to_string());

        let mut blue_node = Node::new("Cool task".to_string());
        blue_node.color = Some("blue".to_string());

        let plain_node = Node::new("Normal task".to_string());

        index.index_document(&doc_id, &[red_node, blue_node, plain_node]).unwrap();

        // has:color should find both colored nodes
        let results = index.search("has:color", None, 10).unwrap();
        assert_eq!(results.len(), 2);

        // color:red should find only the red node
        let results = index.search("color:red", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("Urgent"));
    }

    #[test]
    fn test_search_combined_filters_and_text() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let mut checked_dated = Node::new("Buy milk".to_string());
        checked_dated.node_type = NodeType::Checkbox;
        checked_dated.is_checked = true;
        checked_dated.date = Some("2026-03-10".to_string());

        let mut checked_no_date = Node::new("Buy bread".to_string());
        checked_no_date.node_type = NodeType::Checkbox;
        checked_no_date.is_checked = true;

        let unchecked_dated = {
            let mut n = Node::new("Buy eggs".to_string());
            n.node_type = NodeType::Checkbox;
            n.date = Some("2026-03-11".to_string());
            n
        };

        index.index_document(&doc_id, &[checked_dated, checked_no_date, unchecked_dated]).unwrap();

        // is:completed + has:date should find only the checked+dated node
        let results = index.search("is:completed has:date", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("milk"));

        // is:completed + text search
        let results = index.search("is:completed buy", None, 10).unwrap();
        assert_eq!(results.len(), 2); // milk and bread
    }

    #[test]
    fn test_search_exact_phrase() {
        let (_tmp, index) = setup_test_index();
        let doc_id = Uuid::new_v4();

        let node1 = Node::new("hello world test".to_string());
        let node2 = Node::new("world hello different".to_string());

        index.index_document(&doc_id, &[node1, node2]).unwrap();

        // Exact phrase should only match the first node
        let results = index.search("\"hello world\"", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("hello world"));
    }
}
