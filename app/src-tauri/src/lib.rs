mod commands;
mod watcher;

use commands::AppState;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use watcher::WatcherState;

/// Returns `true` if the webview is allowed to navigate to the given URL.
///
/// We deny any navigation away from the app origin. This prevents the
/// Tauri webview from navigating to a URL that was pasted or dropped into
/// the app (which would otherwise wipe the SPA state and look like a full
/// page reload to the user). External URLs should be opened via the shell
/// plugin's `openUrl` API instead.
fn is_navigation_allowed(url: &tauri::Url) -> bool {
    match url.scheme() {
        // Internal Tauri schemes (production builds)
        "tauri" | "tauri-localhost" => true,
        // Dev server (vite)
        "http" | "https" => matches!(
            url.host_str(),
            Some("localhost") | Some("127.0.0.1") | Some("tauri.localhost")
        ),
        _ => false,
    }
}

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
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .max_file_size(2_000_000)
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                    .build(),
            )?;

            // Create the main window with a navigation guard. This is defense
            // in depth against any code path (drag/drop, paste, link click)
            // that would otherwise navigate the webview away from the app and
            // cause a "full page reload" appearance with unsaved-state loss.
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Outline")
                .inner_size(800.0, 600.0)
                .resizable(true)
                .fullscreen(false)
                .on_navigation(|url| {
                    let allowed = is_navigation_allowed(url);
                    if !allowed {
                        log::warn!("Blocked navigation to: {}", url);
                    }
                    allowed
                })
                .build()?;

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
            commands::save_ops,
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
            commands::reorder_documents,
            // Capture target
            commands::get_default_capture_target,
            // Bookmarks
            commands::list_bookmarks,
            commands::add_bookmark,
            commands::remove_bookmark,
            commands::update_bookmark_label,
            commands::update_bookmark_emoji,
            commands::reorder_bookmarks,
            // Custom emoji
            commands::load_custom_emoji,
            commands::add_custom_emoji,
            commands::remove_custom_emoji,
            commands::copy_emoji_image,
            commands::pick_emoji_image,
            // Watcher commands
            commands::start_documents_watcher,
            commands::stop_documents_watcher,
            commands::is_documents_watcher_running,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
