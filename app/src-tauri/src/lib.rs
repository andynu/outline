mod commands;
mod data;
mod import_export;
mod search;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::export_opml,
            commands::export_markdown,
            commands::export_json,
            commands::import_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
