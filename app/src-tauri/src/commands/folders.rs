use outline_core::data::{
    Folder, FolderState, load_folders,
    create_folder as create_folder_impl,
    update_folder as update_folder_impl,
    delete_folder as delete_folder_impl,
    move_document_to_folder as move_doc_to_folder_impl,
    reorder_folders as reorder_folders_impl,
};

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
