#[tauri::command]
fn get_openclaw_endpoint() -> String {
    // 这里在未来接入真实的 OpenClaw 二进制并使用 tauri-plugin-shell 启动后，
    // 可以从其 stdout 动态捕获分配的可用端口。这里预设默认端口用于平滑过渡。
    "http://127.0.0.1:3000/v1".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_openclaw_endpoint])
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
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
