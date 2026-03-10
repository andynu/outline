use outline_core::data::{
    CustomEmojiRegistry,
    load_custom_emoji as load_custom_emoji_impl,
    add_custom_emoji as add_custom_emoji_impl,
    remove_custom_emoji as remove_custom_emoji_impl,
    data_dir,
};
use std::path::PathBuf;

/// Get the custom emoji registry
#[tauri::command]
pub fn load_custom_emoji() -> Result<CustomEmojiRegistry, String> {
    load_custom_emoji_impl()
}

/// Add a custom emoji (image or text)
#[tauri::command]
pub fn add_custom_emoji(
    shortcode: String,
    src: Option<String>,
    text: Option<String>,
) -> Result<CustomEmojiRegistry, String> {
    add_custom_emoji_impl(shortcode, src, text)
}

/// Remove a custom emoji by shortcode
#[tauri::command]
pub fn remove_custom_emoji(shortcode: String) -> Result<CustomEmojiRegistry, String> {
    remove_custom_emoji_impl(&shortcode)
}

/// Copy an image file into the emoji images directory.
/// Returns the relative path (e.g. "images/filename.png") for use as `src` in add_custom_emoji.
#[tauri::command]
pub fn copy_emoji_image(source_path: String) -> Result<String, String> {
    let source = PathBuf::from(&source_path);

    if !source.exists() {
        return Err(format!("Source file does not exist: {}", source_path));
    }

    let file_name = source
        .file_name()
        .ok_or("Cannot determine file name")?
        .to_string_lossy()
        .to_string();

    // Sanitize filename: lowercase, spaces to underscores
    let sanitized = file_name.to_lowercase().replace(' ', "_");

    let images_dir = data_dir().join("emoji").join("images");
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Failed to create emoji images directory: {}", e))?;

    let dest = images_dir.join(&sanitized);

    std::fs::copy(&source, &dest)
        .map_err(|e| format!("Failed to copy image: {}", e))?;

    Ok(format!("images/{}", sanitized))
}

/// Pick an image file for custom emoji using native file dialog.
/// Returns the selected file path, or null if cancelled.
#[tauri::command]
pub async fn pick_emoji_image(window: tauri::Window) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    window
        .dialog()
        .file()
        .set_title("Select Emoji Image")
        .add_filter("Images", &["png", "gif", "svg", "webp", "jpg", "jpeg"])
        .pick_file(move |result: Option<FilePath>| {
            let _ = tx.send(result);
        });

    match rx.recv() {
        Ok(Some(file_path)) => {
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
