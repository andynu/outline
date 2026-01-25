//! Filesystem watcher for detecting document changes from sync.
//!
//! Watches the documents directory for changes and emits Tauri events
//! when documents are added, removed, or modified.

use notify_debouncer_mini::{new_debouncer, DebouncedEventKind, DebounceEventResult};
use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::data::documents_dir;

/// Payload sent with the documents-changed event
#[derive(Clone, serde::Serialize)]
pub struct DocumentsChangedPayload {
    /// List of document IDs that changed (if known)
    pub document_ids: Vec<String>,
}

/// Handle to the running watcher, used to stop it
pub struct WatcherHandle {
    stop_tx: Sender<()>,
}

impl WatcherHandle {
    /// Stop the watcher
    pub fn stop(&self) {
        let _ = self.stop_tx.send(());
    }
}

/// State for managing the documents watcher
pub struct WatcherState {
    handle: Mutex<Option<WatcherHandle>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            handle: Mutex::new(None),
        }
    }

    /// Check if watcher is currently running
    pub fn is_running(&self) -> bool {
        self.handle.lock().unwrap().is_some()
    }

    /// Set the watcher handle
    pub fn set_handle(&self, handle: WatcherHandle) {
        let mut guard = self.handle.lock().unwrap();
        if let Some(old) = guard.take() {
            old.stop();
        }
        *guard = Some(handle);
    }

    /// Stop and clear the watcher
    pub fn stop(&self) {
        let mut guard = self.handle.lock().unwrap();
        if let Some(handle) = guard.take() {
            handle.stop();
        }
    }
}

/// Start watching the documents directory for changes.
/// Returns a handle that can be used to stop the watcher.
pub fn start_watcher(app_handle: AppHandle) -> Result<WatcherHandle, String> {
    let docs_dir = documents_dir();

    // Create the documents directory if it doesn't exist
    if !docs_dir.exists() {
        std::fs::create_dir_all(&docs_dir)
            .map_err(|e| format!("Failed to create documents directory: {}", e))?;
    }

    // Channel for stopping the watcher
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    // Clone docs_dir for the thread
    let docs_dir_clone = docs_dir.clone();

    // Spawn watcher thread
    thread::spawn(move || {
        log::info!("Starting documents watcher for {:?}", docs_dir_clone);

        // Channel for debounced events
        let (event_tx, event_rx) = mpsc::channel::<DebounceEventResult>();

        // Create debounced watcher with 500ms debounce
        let mut debouncer = match new_debouncer(Duration::from_millis(500), event_tx) {
            Ok(d) => d,
            Err(e) => {
                log::error!("Failed to create debouncer: {}", e);
                return;
            }
        };

        // Watch documents directory recursively
        if let Err(e) = debouncer.watcher().watch(
            &docs_dir_clone,
            notify::RecursiveMode::Recursive,
        ) {
            log::error!("Failed to watch directory: {}", e);
            return;
        }

        log::info!("Documents watcher started successfully");

        loop {
            // Check for stop signal (non-blocking)
            if stop_rx.try_recv().is_ok() {
                log::info!("Documents watcher stopping");
                break;
            }

            // Check for events (with timeout to allow checking stop signal)
            match event_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(events)) => {
                    // Collect changed document IDs
                    let mut changed_ids: Vec<String> = Vec::new();

                    for event in events {
                        if event.kind == DebouncedEventKind::Any {
                            // Extract document ID from path
                            if let Some(doc_id) = extract_document_id(&event.path, &docs_dir_clone) {
                                if !changed_ids.contains(&doc_id) {
                                    changed_ids.push(doc_id);
                                }
                            }
                        }
                    }

                    // Emit event if we have changes
                    if !changed_ids.is_empty() || true {
                        // Always emit to catch new/deleted docs
                        log::info!("Documents changed: {:?}", changed_ids);
                        let payload = DocumentsChangedPayload {
                            document_ids: changed_ids,
                        };
                        if let Err(e) = app_handle.emit("documents-changed", payload) {
                            log::error!("Failed to emit documents-changed event: {}", e);
                        }
                    }
                }
                Ok(Err(errors)) => {
                    log::warn!("Watch error: {:?}", errors);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // No events, continue loop
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    log::info!("Event channel disconnected, stopping watcher");
                    break;
                }
            }
        }

        log::info!("Documents watcher stopped");
    });

    Ok(WatcherHandle { stop_tx })
}

/// Extract document ID from a file path within the documents directory.
/// Returns Some(uuid_string) if the path is within a document folder.
fn extract_document_id(path: &PathBuf, docs_dir: &PathBuf) -> Option<String> {
    // Strip the documents directory prefix
    let relative = path.strip_prefix(docs_dir).ok()?;

    // Get the first component (should be the document UUID directory)
    let first_component = relative.components().next()?;
    let doc_dir_name = first_component.as_os_str().to_str()?;

    // Validate it's a UUID
    if uuid::Uuid::parse_str(doc_dir_name).is_ok() {
        Some(doc_dir_name.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_extract_document_id() {
        let docs_dir = PathBuf::from("/home/user/.outline-data/documents");

        // Valid document path
        let path = PathBuf::from("/home/user/.outline-data/documents/550e8400-e29b-41d4-a716-446655440000/state.json");
        assert_eq!(
            extract_document_id(&path, &docs_dir),
            Some("550e8400-e29b-41d4-a716-446655440000".to_string())
        );

        // Valid pending file path
        let path2 = PathBuf::from("/home/user/.outline-data/documents/550e8400-e29b-41d4-a716-446655440000/pending.machine.jsonl");
        assert_eq!(
            extract_document_id(&path2, &docs_dir),
            Some("550e8400-e29b-41d4-a716-446655440000".to_string())
        );

        // Invalid path (not a UUID)
        let path3 = PathBuf::from("/home/user/.outline-data/documents/not-a-uuid/state.json");
        assert_eq!(extract_document_id(&path3, &docs_dir), None);

        // Path outside documents directory
        let path4 = PathBuf::from("/home/user/.outline-data/inbox.jsonl");
        assert_eq!(extract_document_id(&path4, &docs_dir), None);
    }
}
