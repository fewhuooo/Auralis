mod crypto;
mod document_cache;
mod document_packager;
mod document_upload;
mod local_asset_store;
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
            let runtime_temp = ocr_sidecar::runtime_temp_dir(&app.path().app_cache_dir()?);
            let removed = ocr_sidecar::prepare_runtime_temp(&runtime_temp, false)?;
            if removed > 0 {
                eprintln!(
                    "[OCR Sidecar] removed {removed} stale private _MEI directories during startup"
                );
            }
            app.manage(ocr_sidecar::OcrSupervisorState::new(
                resource_dir,
                image_root,
                runtime_temp,
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
            document_packager::document_local_package_begin,
            document_packager::document_local_package_append,
            document_packager::document_local_package_finish,
            document_packager::document_local_cache_bind,
            document_packager::document_cache_delete,
            document_packager::document_cache_payload_info,
            document_upload::document_upload_put,
            local_database::replace_local_resource_snapshot,
            local_asset_store::import_local_asset,
            local_asset_store::import_local_asset_bytes,
            local_asset_store::resolve_local_asset,
            local_asset_store::local_asset_upload_put,
            local_asset_store::download_local_asset,
            local_asset_store::delete_local_asset,
            local_asset_store::reconcile_local_assets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
