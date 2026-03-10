use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::PathBuf;
use std::sync::Mutex;

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

/// In-memory cache of bookmark state. Populated on first access, updated
/// in-place on mutations, and flushed to disk only when the data changes.
static CACHE: Mutex<Option<BookmarkState>> = Mutex::new(None);

/// Get the bookmarks.json path
fn bookmarks_path() -> PathBuf {
    data_dir().join("bookmarks.json")
}

/// Read bookmarks from disk (bypassing cache).
fn read_bookmarks_from_disk() -> Result<BookmarkState, String> {
    let path = bookmarks_path();
    if !path.exists() {
        return Ok(BookmarkState::default());
    }

    let file = File::open(&path).map_err(|e| format!("Open bookmarks.json: {}", e))?;
    let reader = BufReader::new(file);
    serde_json::from_reader(reader).map_err(|e| format!("Parse bookmarks.json: {}", e))
}

/// Write bookmarks to disk.
fn write_bookmarks_to_disk(state: &BookmarkState) -> Result<(), String> {
    let path = bookmarks_path();
    let file = File::create(&path).map_err(|e| format!("Create bookmarks.json: {}", e))?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, state)
        .map_err(|e| format!("Write bookmarks.json: {}", e))
}

/// Access the cached bookmark state, loading from disk on first call.
/// The callback receives a mutable reference to the state. If `mutated`
/// is returned as true, the state is flushed to disk.
fn with_cache<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&mut BookmarkState) -> Result<(T, bool), String>,
{
    let mut guard = CACHE.lock().map_err(|e| format!("Lock bookmarks cache: {}", e))?;

    if guard.is_none() {
        *guard = Some(read_bookmarks_from_disk()?);
    }

    let state = guard.as_mut().unwrap();
    let (result, mutated) = f(state)?;

    if mutated {
        write_bookmarks_to_disk(state)?;
    }

    Ok(result)
}

/// Clear the in-memory cache, forcing a reload from disk on next access.
/// Useful for tests that manipulate the data dir.
#[cfg(test)]
pub fn invalidate_cache() {
    let mut guard = CACHE.lock().unwrap();
    *guard = None;
}

/// Load bookmarks (from cache or disk on first call)
pub fn load_bookmarks() -> Result<BookmarkState, String> {
    with_cache(|state| Ok((state.clone(), false)))
}

/// Update the emoji for an existing bookmark.
pub fn update_bookmark_emoji(node_id: &str, emoji: Option<String>) -> Result<Bookmark, String> {
    with_cache(|state| {
        let bookmark = state
            .bookmarks
            .iter_mut()
            .find(|b| b.node_id == node_id)
            .ok_or_else(|| format!("No bookmark found for node {}", node_id))?;

        bookmark.emoji = emoji;
        Ok((bookmark.clone(), true))
    })
}

/// Add a bookmark. Returns error if already bookmarked.
pub fn add_bookmark(node_id: String, document_id: String, label: String) -> Result<Bookmark, String> {
    with_cache(|state| {
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
        Ok((bookmark, true))
    })
}

/// Remove a bookmark by node_id
pub fn remove_bookmark(node_id: &str) -> Result<(), String> {
    with_cache(|state| {
        let before = state.bookmarks.len();
        state.bookmarks.retain(|b| b.node_id != node_id);

        if state.bookmarks.len() == before {
            return Err(format!("No bookmark found for node {}", node_id));
        }

        Ok(((), true))
    })
}

/// Update a bookmark's label
pub fn update_bookmark_label(node_id: &str, label: String) -> Result<Bookmark, String> {
    with_cache(|state| {
        let bookmark = state
            .bookmarks
            .iter_mut()
            .find(|b| b.node_id == node_id)
            .ok_or_else(|| format!("No bookmark found for node {}", node_id))?;

        bookmark.label = label;
        Ok((bookmark.clone(), true))
    })
}

/// Reorder bookmarks to match the given node_id order.
pub fn reorder_bookmarks(node_ids: Vec<String>) -> Result<(), String> {
    with_cache(|state| {
        // Build a position map from the requested order
        let position_map: std::collections::HashMap<&str, usize> = node_ids
            .iter()
            .enumerate()
            .map(|(i, id)| (id.as_str(), i))
            .collect();

        // Sort bookmarks by their position in the new order.
        // Any bookmark not in node_ids keeps its relative order at the end.
        let max_pos = node_ids.len();
        state.bookmarks.sort_by_key(|b| {
            position_map.get(b.node_id.as_str()).copied().unwrap_or(max_pos)
        });

        Ok(((), true))
    })
}

/// Check if a node is bookmarked
pub fn is_bookmarked(node_id: &str) -> bool {
    with_cache(|state| {
        Ok((state.bookmarks.iter().any(|b| b.node_id == node_id), false))
    })
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
            invalidate_cache();
            set_data_dir(None);
        }
    }

    fn setup_test_data_dir() -> TestDataDir {
        let tmp = TempDir::new().unwrap();
        set_data_dir(Some(tmp.path().to_path_buf()));
        invalidate_cache();
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
