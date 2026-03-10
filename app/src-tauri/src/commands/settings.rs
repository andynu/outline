use outline_core::data::{
    data_dir, default_data_dir, save_config, set_data_dir, get_capture_target, CaptureTarget,
};

/// Data directory info returned to frontend
#[derive(Clone, serde::Serialize)]
pub struct DataDirectoryInfo {
    pub current: String,
    pub default: String,
    pub is_custom: bool,
}

/// Get the current data directory configuration
#[tauri::command]
pub fn get_data_directory() -> DataDirectoryInfo {
    let current = data_dir();
    let default = default_data_dir();
    let is_custom = current != default;

    DataDirectoryInfo {
        current: current.to_string_lossy().to_string(),
        default: default.to_string_lossy().to_string(),
        is_custom,
    }
}

/// Set the data directory (requires app restart to take full effect)
#[tauri::command]
pub fn set_data_directory(path: Option<String>) -> Result<DataDirectoryInfo, String> {
    // Validate path if provided
    if let Some(ref path_str) = path {
        let path_buf = std::path::PathBuf::from(path_str);

        // Check if path exists or can be created
        if !path_buf.exists() {
            std::fs::create_dir_all(&path_buf)
                .map_err(|e| format!("Cannot create directory: {}", e))?;
        }

        // Check if path is a directory
        if !path_buf.is_dir() {
            return Err("Path is not a directory".to_string());
        }

        // Set the runtime override
        set_data_dir(Some(path_buf));
    } else {
        // Reset to default
        set_data_dir(None);
    }

    // Save to config file
    let mut config = outline_core::data::load_config();
    config.data_directory = path;
    save_config(&config)?;

    Ok(get_data_directory())
}

/// Open a directory picker dialog and return the selected path
#[tauri::command]
pub async fn pick_directory(window: tauri::Window) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    window
        .dialog()
        .file()
        .set_title("Select Data Directory")
        .pick_folder(move |result: Option<FilePath>| {
            let _ = tx.send(result);
        });

    match rx.recv() {
        Ok(Some(file_path)) => {
            // Convert FilePath to string
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

/// Get the default capture target (for quick capture UI)
#[tauri::command]
pub fn get_default_capture_target() -> Option<CaptureTarget> {
    get_capture_target(None).map(|(_, target)| target)
}
