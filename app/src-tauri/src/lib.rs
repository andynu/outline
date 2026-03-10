mod commands;
mod watcher;

use commands::AppState;
use tauri::Manager;
use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize data directory from saved config before anything else
    outline_core::data::init_data_dir_from_config();

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
            commands::update_node_in_document,
            commands::move_node,
            commands::delete_node,
            commands::compact_document,
            commands::check_for_changes,
            commands::reload_if_changed,
            commands::search,
            commands::list_documents,
            commands::get_all_dated_nodes,
            commands::delete_document,
            commands::get_backlinks,
            commands::get_unlinked_references,
            commands::convert_mention_to_link,
            commands::get_next_occurrence,
            commands::generate_ical_feed,
            commands::import_opml,
            commands::import_opml_as_document,
            commands::import_dynalist_backup,
            commands::import_latest_dynalist_backup,
            commands::export_opml,
            commands::export_markdown,
            commands::export_selection_markdown,
            commands::export_json,
            commands::export_html,
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
            // Capture target
            commands::get_default_capture_target,
            // Watcher commands
            commands::start_documents_watcher,
            commands::stop_documents_watcher,
            commands::is_documents_watcher_running,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
