use tauri::Manager;

#[cfg(target_os = "windows")]
pub fn apply_theme(window: &tauri::WebviewWindow, is_dark: bool) {
    const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
    const DWMWA_CAPTION_COLOR: u32 = 35;
    const DWMWA_TEXT_COLOR: u32 = 36;

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: isize,
            dw_attribute: u32,
            pv_attribute: *const std::ffi::c_void,
            cb_attribute: u32,
        ) -> i32;
    }

    if let Ok(hwnd) = window.hwnd() {
        let hwnd_isize = hwnd.0 as isize;
        unsafe {
            // 1. 设置暗黑模式标题栏控件（白图标 vs 深图标）
            let dark_flag: i32 = if is_dark { 1 } else { 0 };
            let _ = DwmSetWindowAttribute(
                hwnd_isize,
                DWMWA_USE_IMMERSIVE_DARK_MODE,
                &dark_flag as *const i32 as *const _,
                std::mem::size_of::<i32>() as u32,
            );

            // 2. 标题栏背景颜色（COLORREF: 0x00BBGGRR）
            // 浅色模式顶栏背景: #F7F2EB (R: 0xF7, G: 0xF2, B: 0xEB) -> COLORREF: 0x00EBF2F7
            // 深色模式顶栏背景: #292825 (R: 0x29, G: 0x28, B: 0x25) -> COLORREF: 0x00252829
            let caption_color: u32 = if is_dark { 0x00252829 } else { 0x00EBF2F7 };
            let _ = DwmSetWindowAttribute(
                hwnd_isize,
                DWMWA_CAPTION_COLOR,
                &caption_color as *const u32 as *const _,
                std::mem::size_of::<u32>() as u32,
            );

            // 3. 标题栏文字颜色（COLORREF: 0x00BBGGRR）
            // 浅色模式文字: #1C1C1A -> COLORREF: 0x001A1C1C
            // 深色模式文字: #FAF7F2 -> COLORREF: 0x00F2F7FA
            let text_color: u32 = if is_dark { 0x00F2F7FA } else { 0x001A1C1C };
            let _ = DwmSetWindowAttribute(
                hwnd_isize,
                DWMWA_TEXT_COLOR,
                &text_color as *const u32 as *const _,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn apply_theme(_window: &tauri::WebviewWindow, _is_dark: bool) {}

#[tauri::command]
pub fn update_window_theme(app: tauri::AppHandle, is_dark: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        for window in app.webview_windows().values() {
            apply_theme(window, is_dark);
        }
    }
    let _ = app;
    let _ = is_dark;
    Ok(())
}

#[tauri::command]
pub fn window_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_is_maximized(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

