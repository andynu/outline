use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::PathBuf;
use std::sync::Mutex;

use super::document::data_dir;

/// A single custom emoji entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomEmoji {
    /// Path to an image file (relative to the emoji directory), e.g. "images/partyparrot.gif"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    /// Text representation, e.g. "¯\_(ツ)_/¯"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub added_at: DateTime<Utc>,
}

/// The on-disk custom emoji registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomEmojiRegistry {
    pub version: u32,
    pub emoji: HashMap<String, CustomEmoji>,
}

impl Default for CustomEmojiRegistry {
    fn default() -> Self {
        Self {
            version: 1,
            emoji: HashMap::new(),
        }
    }
}

/// In-memory cache, same pattern as bookmarks.rs
static CACHE: Mutex<Option<CustomEmojiRegistry>> = Mutex::new(None);

/// Directory containing custom emoji data
fn emoji_dir() -> PathBuf {
    data_dir().join("emoji")
}

/// Path to the custom-emoji.json file
fn emoji_path() -> PathBuf {
    emoji_dir().join("custom-emoji.json")
}

/// Read registry from disk (bypassing cache).
fn read_from_disk() -> Result<CustomEmojiRegistry, String> {
    let path = emoji_path();
    if !path.exists() {
        return Ok(CustomEmojiRegistry::default());
    }

    let file = File::open(&path).map_err(|e| format!("Open custom-emoji.json: {}", e))?;
    let reader = BufReader::new(file);
    serde_json::from_reader(reader).map_err(|e| format!("Parse custom-emoji.json: {}", e))
}

/// Write registry to disk.
fn write_to_disk(registry: &CustomEmojiRegistry) -> Result<(), String> {
    let dir = emoji_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Create emoji dir: {}", e))?;

    let path = emoji_path();
    let file = File::create(&path).map_err(|e| format!("Create custom-emoji.json: {}", e))?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, registry)
        .map_err(|e| format!("Write custom-emoji.json: {}", e))
}

/// Access the cached registry. If `mutated` is returned as true, flushes to disk.
fn with_cache<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&mut CustomEmojiRegistry) -> Result<(T, bool), String>,
{
    let mut guard = CACHE.lock().map_err(|e| format!("Lock emoji cache: {}", e))?;

    if guard.is_none() {
        *guard = Some(read_from_disk()?);
    }

    let state = guard.as_mut().unwrap();
    let (result, mutated) = f(state)?;

    if mutated {
        write_to_disk(state)?;
    }

    Ok(result)
}

/// Clear the in-memory cache, forcing a reload from disk on next access.
#[cfg(test)]
pub fn invalidate_emoji_cache() {
    let mut guard = CACHE.lock().unwrap();
    *guard = None;
}

/// Load the custom emoji registry (from cache or disk on first call)
pub fn load_custom_emoji() -> Result<CustomEmojiRegistry, String> {
    with_cache(|state| Ok((state.clone(), false)))
}

/// Add a custom emoji. Provide exactly one of `src` or `text`.
pub fn add_custom_emoji(
    shortcode: String,
    src: Option<String>,
    text: Option<String>,
) -> Result<CustomEmojiRegistry, String> {
    if src.is_none() && text.is_none() {
        return Err("Custom emoji must have either src or text".to_string());
    }
    if src.is_some() && text.is_some() {
        return Err("Custom emoji cannot have both src and text".to_string());
    }

    with_cache(|state| {
        state.emoji.insert(
            shortcode,
            CustomEmoji {
                src,
                text,
                added_at: Utc::now(),
            },
        );
        Ok((state.clone(), true))
    })
}

/// Remove a custom emoji by shortcode
pub fn remove_custom_emoji(shortcode: &str) -> Result<CustomEmojiRegistry, String> {
    with_cache(|state| {
        if state.emoji.remove(shortcode).is_none() {
            return Err(format!("No custom emoji with shortcode '{}'", shortcode));
        }
        Ok((state.clone(), true))
    })
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
            invalidate_emoji_cache();
            set_data_dir(None);
        }
    }

    fn setup_test_data_dir() -> TestDataDir {
        let tmp = TempDir::new().unwrap();
        set_data_dir(Some(tmp.path().to_path_buf()));
        invalidate_emoji_cache();
        TestDataDir(tmp)
    }

    #[test]
    fn test_load_empty_registry() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        let reg = load_custom_emoji().unwrap();
        assert_eq!(reg.version, 1);
        assert!(reg.emoji.is_empty());
    }

    #[test]
    fn test_add_image_emoji() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        let reg = add_custom_emoji(
            "partyparrot".to_string(),
            Some("images/partyparrot.gif".to_string()),
            None,
        )
        .unwrap();

        assert_eq!(reg.emoji.len(), 1);
        let emoji = reg.emoji.get("partyparrot").unwrap();
        assert_eq!(emoji.src.as_deref(), Some("images/partyparrot.gif"));
        assert!(emoji.text.is_none());
    }

    #[test]
    fn test_add_text_emoji() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        let reg = add_custom_emoji(
            "shrug_text".to_string(),
            None,
            Some("¯\\_(ツ)_/¯".to_string()),
        )
        .unwrap();

        let emoji = reg.emoji.get("shrug_text").unwrap();
        assert_eq!(emoji.text.as_deref(), Some("¯\\_(ツ)_/¯"));
        assert!(emoji.src.is_none());
    }

    #[test]
    fn test_add_requires_src_or_text() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        let result = add_custom_emoji("empty".to_string(), None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must have either"));
    }

    #[test]
    fn test_add_rejects_both_src_and_text() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        let result = add_custom_emoji(
            "both".to_string(),
            Some("images/x.gif".to_string()),
            Some("text".to_string()),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot have both"));
    }

    #[test]
    fn test_remove_emoji() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        add_custom_emoji(
            "partyparrot".to_string(),
            Some("images/partyparrot.gif".to_string()),
            None,
        )
        .unwrap();

        let reg = remove_custom_emoji("partyparrot").unwrap();
        assert!(reg.emoji.is_empty());
    }

    #[test]
    fn test_remove_nonexistent_emoji() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        let result = remove_custom_emoji("nope");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No custom emoji"));
    }

    #[test]
    fn test_persistence_across_cache_invalidation() {
        let _lock = TEST_DATA_DIR_MUTEX.lock().unwrap();
        let _tmp = setup_test_data_dir();

        add_custom_emoji(
            "partyparrot".to_string(),
            Some("images/partyparrot.gif".to_string()),
            None,
        )
        .unwrap();

        // Invalidate cache to force re-read from disk
        invalidate_emoji_cache();

        let reg = load_custom_emoji().unwrap();
        assert_eq!(reg.emoji.len(), 1);
        assert!(reg.emoji.contains_key("partyparrot"));
    }
}
