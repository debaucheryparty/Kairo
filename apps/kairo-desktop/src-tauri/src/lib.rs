use std::net::TcpListener;
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;

#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::TrayIconBuilder;

struct BackendState {
    port: u16,
}

#[tauri::command]
fn get_backend_port(state: State<'_, Mutex<BackendState>>) -> Result<u16, String> {
    let guard = state
        .lock()
        .map_err(|_| "backend state lock poisoned".to_string())?;
    Ok(guard.port)
}

fn get_available_port() -> Option<u16> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let port = get_available_port().unwrap_or(8080);
            app.manage(Mutex::new(BackendState { port }));

            #[cfg(desktop)]
            {
                let quit_i = MenuItem::with_id(app, "quit", "Quit Kairo", true, None::<&str>)?;
                let show_i = MenuItem::with_id(app, "show", "Show Kairo", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                let mut tray_builder = TrayIconBuilder::new().menu(&menu);
                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }

                let _tray = tray_builder
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .build(app)?;
            }

            let sidecar_command = app.shell().sidecar("kairo-backend")?;
            let (mut _rx, _child) = sidecar_command
                .args([format!("--bind=127.0.0.1:{}", port)])
                .spawn()?;

            Ok(())
        });

    if let Err(err) = app.run(tauri::generate_context!()) {
        eprintln!("error while running tauri application: {err}");
    }
}
