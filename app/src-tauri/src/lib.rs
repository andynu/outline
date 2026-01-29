mod commands;
mod data;
mod import_export;
mod search;
mod watcher;

use commands::AppState;
use tauri::Manager;
use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize data directory from saved config before anything else
    data::init_data_dir_from_config();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .manage(WatcherState::new())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start the documents watcher
            let app_handle = app.handle().clone();
            match watcher::start_watcher(app_handle) {
                Ok(handle) => {
                    let watcher_state: tauri::State<WatcherState> = app.state();
                    watcher_state.set_handle(handle);
                    log::info!("Documents watcher initialized");
                }
                Err(e) => {
                    log::error!("Failed to start documents watcher: {}", e);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_document,
            commands::save_op,
            commands::create_node,
            commands::create_node_with_id,
            commands::update_node,
            commands::move_node,
            commands::delete_node,
            commands::compact_document,
            commands::check_for_changes,
            commands::reload_if_changed,
            commands::search,
            commands::list_documents,
            commands::get_backlinks,
            commands::get_next_occurrence,
            commands::generate_ical_feed,
            commands::get_inbox,
            commands::get_inbox_count,
            commands::clear_inbox_items,
            commands::import_opml,
            commands::import_opml_as_document,
            commands::import_dynalist_backup,
            commands::import_latest_dynalist_backup,
            commands::export_opml,
            commands::export_markdown,
            commands::export_selection_markdown,
            commands::export_json,
            commands::save_to_file_with_dialog,
            commands::import_json,
            commands::get_data_directory,
            commands::set_data_directory,
            commands::pick_directory,
            // Folder management
            commands::get_folders,
            commands::create_folder,
            commands::update_folder,
            commands::delete_folder,
            commands::move_document_to_folder,
            commands::reorder_folders,
            // Inbox configuration
            commands::get_inbox_setting,
            commands::set_inbox_setting,
            commands::clear_inbox_setting,
            commands::import_inbox_items,
            // Watcher commands
            commands::start_documents_watcher,
            commands::stop_documents_watcher,
            commands::is_documents_watcher_running,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
