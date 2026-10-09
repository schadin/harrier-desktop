#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// mod menu;
mod migrate;
mod tray;

use tauri::{webview::{NewWindowResponse, WebviewWindowBuilder}, WebviewUrl};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tauri_plugin_opener::OpenerExt;

pub fn run() {
    migrate::migrate_settings();

    for key in ["NO_PROXY", "no_proxy"] {
        let current_val = std::env::var(key).unwrap_or_default();
        if !current_val.contains("localhost") {
            let new_val = if current_val.is_empty() {
                "localhost,127.0.0.1".to_string()
            } else {
                format!("{},localhost,127.0.0.1", current_val)
            };
            std::env::set_var(key, new_val);
        }
    }

    let port: u16 = 44548;
    let context = tauri::generate_context!();
    let builder = tauri::Builder::default();

    // #[cfg(target_os = "macos")]
    // {
    //     builder = builder.menu(menu::menu());
    // }

    builder
        // Перехватывает повторный запуск: второй процесс не создаётся,
        // уже запущенный экземпляр показывает и фокусирует своё окно.
        // Плагин должен регистрироваться первым, до создания окна.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(tray::DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            tray::set_desktop_settings,
            tray::set_statuses,
            tray::set_active_status,
            tray::set_tray_icon
        ])
        .setup(move |app| {
            // Dev: use devUrl from tauri.conf.json (http://localhost:8080) to support HMR
            #[cfg(debug_assertions)]
            let window_url = WebviewUrl::App(Default::default());

            // Release: tauri-plugin-localhost serves bundled frontend assets on this port
            #[cfg(not(debug_assertions))]
            let window_url = {
                let url = format!("http://localhost:{}", port).parse().unwrap();
                WebviewUrl::External(url)
            };

            let app_handle = app.handle().clone();
            #[allow(unused_mut)]
            let mut window_builder = WebviewWindowBuilder::new(app, "main".to_string(), window_url)
                .title("Harrier")
                .disable_drag_drop_handler()
                .on_new_window(move |url, _features| {
                    let _ = app_handle.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                });

            #[cfg(target_os = "macos")]
            let window_builder = window_builder.title_bar_style(TitleBarStyle::Transparent);

            #[cfg(target_os = "linux")]
            let is_niri = std::env::var("NIRI_SOCKET").is_ok();

            #[cfg(target_os = "linux")]
            if is_niri {
                window_builder = window_builder.decorations(false).shadow(false).visible(false);
            }

            #[allow(unused_variables)]
            let window = window_builder.build()?;

            #[cfg(target_os = "linux")]
            if is_niri {
                use gtk::prelude::*;

                for widget in gtk::Window::list_toplevels() {
                    if let Ok(gtk_window) = widget.downcast::<gtk::Window>() {
                        if gtk_window.title().map_or(false, |t| t == "Harrier") {
                            gtk_window.set_titlebar(None::<&gtk::Widget>);
                            gtk_window.set_decorated(false);
                        }
                    }
                }

                window.show()?;
            }

            Ok(())
        })
        .run(context)
        .expect("error while building tauri application");
}
