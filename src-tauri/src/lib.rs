pub mod db;

use db::DbPool;
use std::fs;
use tauri::Manager;

/// Application state shared across Tauri commands.
pub struct AppState {
    pub db: DbPool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Resolve ~/.skillsmanage/db.sqlite
            let home_dir = app
                .path()
                .home_dir()
                .expect("Failed to resolve home directory");
            let db_dir = home_dir.join(".skillsmanage");
            fs::create_dir_all(&db_dir)
                .expect("Failed to create ~/.skillsmanage directory");
            let db_path = db_dir
                .join("db.sqlite")
                .to_string_lossy()
                .into_owned();

            // Create pool and initialize schema
            let pool = tauri::async_runtime::block_on(async {
                db::create_pool(&db_path)
                    .await
                    .expect("Failed to open SQLite database")
            });
            tauri::async_runtime::block_on(async {
                db::init_database(&pool)
                    .await
                    .expect("Failed to initialize database schema")
            });

            app.manage(AppState { db: pool });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
