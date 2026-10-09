use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::menu::{
    CheckMenuItem, CheckMenuItemBuilder, IsMenuItem, Menu, MenuBuilder, MenuEvent, MenuItemBuilder,
    PredefinedMenuItem,
};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

const TRAY_ID: &str = "main-tray";

#[derive(Debug, Clone, Copy, Default)]
pub struct DesktopSettings {
    pub show_tray: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StatusPreset {
    pub emoji: String,
    pub text: String,
}

pub struct DesktopState {
    pub settings: Mutex<DesktopSettings>,
    pub statuses: Mutex<Vec<StatusPreset>>,
    pub active_status: Mutex<Option<StatusPreset>>,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            settings: Mutex::new(DesktopSettings::default()),
            statuses: Mutex::new(Vec::new()),
            active_status: Mutex::new(None),
        }
    }
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn emit_event<P: Serialize + Clone>(app: &AppHandle, event: &str, payload: P) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(event, payload);
    }
}

fn build_menu(
    app: &AppHandle,
    statuses: &[StatusPreset],
    active: &Option<StatusPreset>,
) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItemBuilder::with_id("tray-open", "Open Harrier").build(app)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let mut status_items: Vec<CheckMenuItem<tauri::Wry>> = Vec::with_capacity(statuses.len());
    for (idx, preset) in statuses.iter().enumerate() {
        let label = if preset.emoji.trim().is_empty() {
            preset.text.trim().to_string()
        } else {
            format!("{} {}", preset.emoji, preset.text.trim())
        };
        let checked = matches!(active, Some(a) if a.emoji == preset.emoji && a.text == preset.text);
        let item = CheckMenuItemBuilder::with_id(format!("tray-status-{}", idx), label)
            .checked(checked)
            .build(app)?;
        status_items.push(item);
    }

    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("tray-quit", "Quit").build(app)?;

    let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> =
        Vec::with_capacity(2 + status_items.len() + 2);
    items.push(&open);
    items.push(&sep1);
    for item in &status_items {
        items.push(item);
    }
    items.push(&sep2);
    items.push(&quit);

    MenuBuilder::new(app).items(&items).build()
}

fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "tray-open" => show_main_window(app),
        "tray-quit" => app.exit(0),
        id => {
            if let Some(idx) = id
                .strip_prefix("tray-status-")
                .and_then(|s| s.parse::<usize>().ok())
            {
                let state = app.state::<DesktopState>();
                let statuses = state.statuses.lock().unwrap().clone();
                if let Some(preset) = statuses.get(idx) {
                    emit_event(app, "tray-set-status", preset.clone());
                }
            }
        }
    }
}

fn on_tray_icon_event(tray: &TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        show_main_window(tray.app_handle());
    }
}

fn set_linux_indicator_title(tray: &tauri::tray::TrayIcon<tauri::Wry>, title: &str) {
    #[cfg(target_os = "linux")]
    {
        let title = title.to_string();
        let _ = tray.with_inner_tray_icon(move |inner| unsafe {
            let ptr = inner.app_indicator() as *mut libappindicator::AppIndicator;
            (*ptr).set_title(&title);
        });
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (tray, title);
    }
}

#[cfg(target_os = "linux")]
fn ayatana_has_activate_signal(air: *mut libappindicator::_AppIndicator) -> bool {
    use gtk::glib::gobject_ffi::g_signal_lookup;
    use gtk::glib::translate::{FromGlibPtrNone, IntoGlib};
    use gtk::glib::ObjectExt;

    let obj = unsafe {
        gtk::glib::Object::from_glib_none(air as *mut gtk::glib::gobject_ffi::GObject)
    };
    let gtype = obj.type_().into_glib();
    unsafe { g_signal_lookup(b"activate\0".as_ptr() as *const _, gtype) != 0 }
}

fn set_linux_secondary_activate_target(app: AppHandle, tray: &tauri::tray::TrayIcon<tauri::Wry>) {
    #[cfg(target_os = "linux")]
    {
        let handle = app.clone();
        let _ = tray.with_inner_tray_icon(move |inner| unsafe {
            use gtk::glib::translate::ToGlibPtr;
            use gtk::prelude::*;

            let air = *(inner.app_indicator() as *const libappindicator::AppIndicator
                as *const *mut libappindicator::_AppIndicator);

            if !ayatana_has_activate_signal(air) {
                eprintln!(
                    "WARNING: focus window on left-click is unavailable — \
                     requires libayatana-appindicator 0.6.0 or newer"
                );
            }

            let menu_item = gtk::MenuItem::new();
            let cb_handle = handle.clone();
            menu_item.connect_activate(move |_| {
                show_main_window(&cb_handle);
            });

            let widget: &gtk::Widget = menu_item.upcast_ref();
            libappindicator::app_indicator_set_secondary_activate_target(
                air,
                widget.to_glib_none().0,
            );

            std::mem::forget(menu_item);
        });
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, tray);
    }
}

fn update_tray(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<DesktopState>();
    let settings = *state.settings.lock().unwrap();
    let statuses = state.statuses.lock().unwrap().clone();
    let active = state.active_status.lock().unwrap().clone();

    if !settings.show_tray {
        app.remove_tray_by_id(TRAY_ID);
        return Ok(());
    }

    let menu = build_menu(app, &statuses, &active)?;

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
        return Ok(());
    }

    let icon = app.default_window_icon().cloned().ok_or_else(|| {
        tauri::Error::InvalidIcon(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "default_window_icon not found",
        ))
    })?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Harrier")
        .title("Harrier")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(on_tray_icon_event)
        .build(app)?;
    set_linux_indicator_title(&tray, "Harrier");
    set_linux_secondary_activate_target(app.clone(), &tray);

    Ok(())
}

#[tauri::command]
pub fn set_desktop_settings(app: AppHandle, show_tray: bool) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    *state.settings.lock().unwrap() = DesktopSettings { show_tray };
    update_tray(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_statuses(app: AppHandle, statuses: Vec<StatusPreset>) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    *state.statuses.lock().unwrap() = statuses;
    update_tray(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_active_status(app: AppHandle, active: Option<StatusPreset>) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    *state.active_status.lock().unwrap() = active;
    update_tray(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_icon(app: AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    let image = tauri::image::Image::from_bytes(&bytes).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_icon(Some(image)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
