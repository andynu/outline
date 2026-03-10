use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::PathBuf;

use super::document::data_dir;

/// A bookmark to a specific node in a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub node_id: String,
    pub document_id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// All bookmarks
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BookmarkState {
    pub bookmarks: Vec<Bookmark>,
}

/// Get the bookmarks.json path
fn bookmarks_path() -> PathBuf {
    data_dir().join("bookmarks.json")
}

/// Load bookmarks from disk
pub fn load_bookmarks() -> Result<BookmarkState, String> {
    let path = bookmarks_path();
    if !path.exists() {
        return Ok(BookmarkState::default());
    }

    let file = File::open(&path).map_err(|e| format!("Open bookmarks.json: {}", e))?;
    let reader = BufReader::new(file);
    serde_json::from_reader(reader).map_err(|e| format!("Parse bookmarks.json: {}", e))
}

/// Save bookmarks to disk
fn save_bookmarks(state: &BookmarkState) -> Result<(), String> {
    let path = bookmarks_path();
    let file = File::create(&path).map_err(|e| format!("Create bookmarks.json: {}", e))?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, state)
        .map_err(|e| format!("Write bookmarks.json: {}", e))
}

/// Add a bookmark. Returns error if already bookmarked.
pub fn update_bookmark_emoji(node_id: &str, emoji: Option<String>) -> Result<Bookmark, String> {
    let mut state = load_bookmarks()?;

    let bookmark = state
        .bookmarks
        .iter_mut()
        .find(|b| b.node_id == node_id)
        .ok_or_else(|| format!("No bookmark found for node {}", node_id))?;

    bookmark.emoji = emoji;
    let result = bookmark.clone();
    save_bookmarks(&state)?;
    Ok(result)
}

/// Add a bookmark. Returns error if already bookmarked.
pub fn add_bookmark(node_id: String, document_id: String, label: String) -> Result<Bookmark, String> {
    let mut state = load_bookmarks()?;

    // Check for duplicate
    if state.bookmarks.iter().any(|b| b.node_id == node_id) {
        return Err(format!("Node {} is already bookmarked", node_id));
    }

    let bookmark = Bookmark {
        node_id,
        document_id,
        label,
        emoji: None,
        created_at: Utc::now(),
    };

    state.bookmarks.push(bookmark.clone());
    save_bookmarks(&state)?;
    Ok(bookmark)
}

/// Remove a bookmark by node_id
pub fn remove_bookmark(node_id: &str) -> Result<(), String> {
    let mut state = load_bookmarks()?;
    let before = state.bookmarks.len();
    state.bookmarks.retain(|b| b.node_id != node_id);

    if state.bookmarks.len() == before {
        return Err(format!("No bookmark found for node {}", node_id));
    }

    save_bookmarks(&state)
}

/// Update a bookmark's label
pub fn update_bookmark_label(node_id: &str, label: String) -> Result<Bookmark, String> {
    let mut state = load_bookmarks()?;

    let bookmark = state
        .bookmarks
        .iter_mut()
        .find(|b| b.node_id == node_id)
        .ok_or_else(|| format!("No bookmark found for node {}", node_id))?;

    bookmark.label = label;
    let result = bookmark.clone();
    save_bookmarks(&state)?;
    Ok(result)
}

/// Check if a node is bookmarked
pub fn is_bookmarked(node_id: &str) -> bool {
    load_bookmarks()
        .map(|state| state.bookmarks.iter().any(|b| b.node_id == node_id))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::document::{set_data_dir, TEST_DATA_DIR_MUTEX};
    use tempfile::TempDir;

    #[allow(dead_code)]
    struct TestDataDir(TempDir);
    impl Drop for TestDataDir {
        fn drop(&mut self) {
            set_data_dir(None);
        }
    }

    fn setup_test_data_dir() -> TestDataDir {
        let tmp = TempDir::new().unwrap();
        set_data_dir(Some(tmp.path().to_path_buf()));
        TestDataDir(tmp)
    }

    #[test]
    fn test_add_and_list_bookmarks() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        let bm = add_bookmark(
            "node-1".to_string(),
            "doc-1".to_string(),
            "My Bookmark".to_string(),
        )
        .unwrap();
        assert_eq!(bm.node_id, "node-1");
        assert_eq!(bm.label, "My Bookmark");

        let state = load_bookmarks().unwrap();
        assert_eq!(state.bookmarks.len(), 1);
        assert_eq!(state.bookmarks[0].node_id, "node-1");
    }

    #[test]
    fn test_duplicate_bookmark_error() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        add_bookmark("node-1".to_string(), "doc-1".to_string(), "BM".to_string()).unwrap();
        let result = add_bookmark("node-1".to_string(), "doc-1".to_string(), "BM2".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already bookmarked"));
    }

    #[test]
    fn test_remove_bookmark() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        add_bookmark("node-1".to_string(), "doc-1".to_string(), "BM".to_string()).unwrap();
        add_bookmark("node-2".to_string(), "doc-1".to_string(), "BM2".to_string()).unwrap();

        remove_bookmark("node-1").unwrap();

        let state = load_bookmarks().unwrap();
        assert_eq!(state.bookmarks.len(), 1);
        assert_eq!(state.bookmarks[0].node_id, "node-2");
    }

    #[test]
    fn test_remove_nonexistent_bookmark_error() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        let result = remove_bookmark("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_update_bookmark_label() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        add_bookmark("node-1".to_string(), "doc-1".to_string(), "Old".to_string()).unwrap();

        let updated = update_bookmark_label("node-1", "New Label".to_string()).unwrap();
        assert_eq!(updated.label, "New Label");

        let state = load_bookmarks().unwrap();
        assert_eq!(state.bookmarks[0].label, "New Label");
    }

    #[test]
    fn test_is_bookmarked() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        assert!(!is_bookmarked("node-1"));
        add_bookmark("node-1".to_string(), "doc-1".to_string(), "BM".to_string()).unwrap();
        assert!(is_bookmarked("node-1"));
    }
}
