use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

use crate::data::{data_dir, Node};

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
    fn db_path() -> PathBuf {
        data_dir().join(".cache").join("outline.db")
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
            "#,
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Index a document's nodes (replaces any existing entries for that document)
    pub fn index_document(&self, document_id: &Uuid, nodes: &[Node]) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        let doc_id_str = document_id.to_string();

        // Delete existing entries for this document
        conn.execute(
            "DELETE FROM nodes WHERE document_id = ?",
            params![doc_id_str],
        )?;

        // Insert new entries
        let mut stmt = conn.prepare(
            r#"
            INSERT INTO nodes (id, document_id, parent_id, content, note, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )?;

        for node in nodes {
            let tags_str = if node.tags.is_empty() {
                None
            } else {
                Some(node.tags.join(" "))
            };

            stmt.execute(params![
                node.id.to_string(),
                doc_id_str,
                node.parent_id.map(|id| id.to_string()),
                strip_html(&node.content),
                node.note,
                tags_str,
                node.created_at.to_rfc3339(),
                node.updated_at.to_rfc3339(),
            ])?;
        }

        Ok(())
    }

    /// Search for nodes matching a query
    pub fn search(
        &self,
        query: &str,
        document_id: Option<&Uuid>,
        limit: usize,
    ) -> SqliteResult<Vec<SearchResult>> {
        let conn = self.conn.lock().unwrap();

        // Escape query for FTS5 (wrap words in quotes for phrase matching)
        let escaped_query = escape_fts_query(query);

        let sql = if document_id.is_some() {
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
            WHERE nodes_fts MATCH ?
            AND n.document_id = ?
            ORDER BY rank
            LIMIT ?
            "#
        } else {
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
            WHERE nodes_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            "#
        };

        let mut results = Vec::new();

        if document_id.is_some() {
            let doc_id_str = document_id.unwrap().to_string();
            let mut stmt = conn.prepare(sql)?;
            let rows = stmt.query_map(params![escaped_query, doc_id_str, limit as i64], |row| {
                Ok(SearchResult {
                    node_id: row.get(0)?,
                    document_id: row.get(1)?,
                    content: row.get(2)?,
                    note: row.get(3)?,
                    snippet: row.get(4)?,
                    rank: row.get(5)?,
                })
            })?;

            for result in rows {
                if let Ok(r) = result {
                    results.push(r);
                }
            }
        } else {
            let mut stmt = conn.prepare(sql)?;
            let rows = stmt.query_map(params![escaped_query, limit as i64], |row| {
                Ok(SearchResult {
                    node_id: row.get(0)?,
                    document_id: row.get(1)?,
                    content: row.get(2)?,
                    note: row.get(3)?,
                    snippet: row.get(4)?,
                    rank: row.get(5)?,
                })
            })?;

            for result in rows {
                if let Ok(r) = result {
                    results.push(r);
                }
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

        conn.execute(
            r#"
            INSERT OR REPLACE INTO nodes (id, document_id, parent_id, content, note, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

/// Escape a query string for FTS5 matching
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
                content TEXT NOT NULL,
                note TEXT,
                tags TEXT,
                created_at TEXT,
                updated_at TEXT
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
}
