mod crypto;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
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
            crypto::crypto_generate_master_key,
            crypto::crypto_has_master_key,
            crypto::crypto_encrypt,
            crypto::crypto_decrypt,
            crypto::crypto_export_key_bundle,
            crypto::crypto_import_key_bundle,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
