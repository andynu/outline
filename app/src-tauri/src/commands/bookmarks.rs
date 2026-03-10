use outline_core::data::{
    Bookmark, BookmarkState,
    load_bookmarks as load_bookmarks_impl,
    add_bookmark as add_bookmark_impl,
    remove_bookmark as remove_bookmark_impl,
    update_bookmark_label as update_bookmark_label_impl,
    update_bookmark_emoji as update_bookmark_emoji_impl,
    reorder_bookmarks as reorder_bookmarks_impl,
};

/// Get all bookmarks
#[tauri::command]
pub fn list_bookmarks() -> Result<BookmarkState, String> {
    load_bookmarks_impl()
}

/// Add a bookmark
#[tauri::command]
pub fn add_bookmark(node_id: String, document_id: String, label: String) -> Result<Bookmark, String> {
    add_bookmark_impl(node_id, document_id, label)
}

/// Remove a bookmark by node_id
#[tauri::command]
pub fn remove_bookmark(node_id: String) -> Result<(), String> {
    remove_bookmark_impl(&node_id)
}

/// Update a bookmark's label
#[tauri::command]
pub fn update_bookmark_label(node_id: String, label: String) -> Result<Bookmark, String> {
    update_bookmark_label_impl(&node_id, label)
}

/// Update a bookmark's emoji
#[tauri::command]
pub fn update_bookmark_emoji(node_id: String, emoji: Option<String>) -> Result<Bookmark, String> {
    update_bookmark_emoji_impl(&node_id, emoji)
}

/// Reorder bookmarks
#[tauri::command]
pub fn reorder_bookmarks(node_ids: Vec<String>) -> Result<(), String> {
    reorder_bookmarks_impl(node_ids)
}
