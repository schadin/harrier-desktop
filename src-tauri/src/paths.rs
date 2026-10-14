use std::path::PathBuf;

// Идентификатор приложения — тот же, что в tauri.conf.json, используется для
// формирования путей к каталогам конфигурации и данных во всех модулях.
pub const APP_IDENTIFIER: &str = "io.github.schadin.harrier";

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[cfg(target_os = "linux")]
pub fn base_config_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| home_dir().map(|h| h.join(".config")))
}

#[cfg(target_os = "linux")]
pub fn base_data_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| home_dir().map(|h| h.join(".local").join("share")))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn base_config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        home_dir().map(|h| h.join("Library").join("Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from)
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn base_data_dir() -> Option<PathBuf> {
    base_config_dir()
}

// Каталог данных приложения с учётом идентификатора — общий источник истины
// для чтения флага (до tauri::Builder) и запись (командой set_single_instance).
pub fn app_data_dir() -> Option<PathBuf> {
    base_data_dir().map(|d| d.join(APP_IDENTIFIER))
}
