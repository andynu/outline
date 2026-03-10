use tauri::State;

use crate::watcher::WatcherState;

/// Start the documents directory watcher
#[tauri::command]
pub fn start_documents_watcher(
    app: tauri::AppHandle,
    watcher_state: State<WatcherState>,
) -> Result<bool, String> {
    if watcher_state.is_running() {
        return Ok(false); // Already running
    }

    let handle = crate::watcher::start_watcher(app)?;
    watcher_state.set_handle(handle);
    Ok(true)
}

/// Stop the documents directory watcher
#[tauri::command]
pub fn stop_documents_watcher(watcher_state: State<WatcherState>) -> Result<(), String> {
    watcher_state.stop();
    Ok(())
}

/// Check if the documents watcher is running
#[tauri::command]
pub fn is_documents_watcher_running(watcher_state: State<WatcherState>) -> bool {
    watcher_state.is_running()
}
