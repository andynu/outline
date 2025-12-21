mod commands;
mod data;
mod import_export;
mod search;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize data directory from saved config before anything else
    data::init_data_dir_from_config();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_document,
            commands::save_op,
            commands::create_node,
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
            commands::export_opml,
            commands::export_markdown,
            commands::export_json,
            commands::import_json,
            commands::get_data_directory,
            commands::set_data_directory,
            commands::pick_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
