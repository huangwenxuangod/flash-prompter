use tauri::{LogicalPosition, LogicalSize, Manager};

#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
};

#[cfg(target_os = "windows")]
fn exclude_from_capture(window: &tauri::WebviewWindow) {
    if let Ok(handle) = window.window_handle() {
        if let RawWindowHandle::Win32(win) = handle.as_raw() {
            let hwnd = HWND(win.hwnd.get() as _);
            let _ = unsafe { SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) };
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn exclude_from_capture(_window: &tauri::WebviewWindow) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                exclude_from_capture(&window);
                let window_width = 420.0;
                let window_height = 300.0;
                let top_offset = -300.0;
                if let Ok(Some(monitor)) = app.primary_monitor() {
                    let scale_factor = monitor.scale_factor();
                    let monitor_size = monitor.size();
                    let monitor_position = monitor.position();
                    let logical_width = monitor_size.width as f64 / scale_factor;
                    let logical_height = monitor_size.height as f64 / scale_factor;
                    let logical_x = monitor_position.x as f64 / scale_factor;
                    let logical_y = monitor_position.y as f64 / scale_factor;
                    let center_x = logical_x + (logical_width - window_width) / 2.0;
                    let center_y =
                        logical_y + (logical_height - window_height) / 2.0 + top_offset;
                    let _ = window.set_size(LogicalSize::new(window_width, window_height));
                    let _ = window.set_position(LogicalPosition::new(center_x, center_y));
                    let _ = window.set_always_on_top(true);
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
