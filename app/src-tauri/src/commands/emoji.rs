use outline_core::data::{
    CustomEmojiRegistry,
    load_custom_emoji as load_custom_emoji_impl,
    add_custom_emoji as add_custom_emoji_impl,
    remove_custom_emoji as remove_custom_emoji_impl,
};

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
