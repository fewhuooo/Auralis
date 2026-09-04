mod crypto;
mod document_cache;
mod document_packager;
mod document_upload;
mod local_database;
mod ocr_sidecar;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let resource_dir = app.path().resource_dir()?;
            let image_root = app.path().app_data_dir()?.join("ocr-images");
            app.manage(ocr_sidecar::OcrSupervisorState::new(
                resource_dir,
                image_root,
            ));
            app.manage(document_packager::DocumentPackagerState::new(
                app.path().app_data_dir()?.join("document-cache"),
            ));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .clear_targets()
                        .target(Target::new(TargetKind::Stdout))
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
            ocr_sidecar::ocr_warmup,
            ocr_sidecar::ocr_recognize_page,
            ocr_sidecar::ocr_shutdown,
            document_packager::document_package_begin,
            document_packager::document_package_append,
            document_packager::document_package_finish,
            document_packager::document_cache_delete,
            document_upload::document_upload_put,
            local_database::replace_local_resource_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
