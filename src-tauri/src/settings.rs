use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::paths;

const SETTINGS_FILE: &str = "single-instance.json";

// Жёсткий путь к файлу настройки: каталог данных приложения + single-instance.json.
fn settings_path() -> Option<PathBuf> {
    paths::app_data_dir().map(|d| d.join(SETTINGS_FILE))
}

// Чтение флага. При отсутствии файла или любой ошибке парсинга — false
// (и сообщение в stderr), чтобы битый/отсутствующий файл не ломал запуск.
pub fn read_single_instance() -> bool {
    let Some(path) = settings_path() else {
        eprintln!("single-instance: cannot resolve data dir, defaulting to false");
        return false;
    };
    match fs::read_to_string(&path) {
        Ok(contents) => match serde_json::from_str::<serde_json::Value>(&contents) {
            Ok(value) => value
                .get("singleInstance")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            Err(e) => {
                eprintln!("single-instance: parse failed ({}), defaulting to false", e);
                false
            }
        },
        Err(e) => {
            if e.kind() != std::io::ErrorKind::NotFound {
                eprintln!("single-instance: read failed ({}), defaulting to false", e);
            }
            false
        }
    }
}

// Команда записи флага: создаёт каталог данных, если нужно, пишет JSON.
#[tauri::command]
pub fn set_single_instance(_app: AppHandle, enabled: bool) -> Result<(), String> {
    let path = settings_path().ok_or_else(|| "cannot resolve data dir".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create data dir failed: {e}"))?;
    }
    let payload = serde_json::json!({ "singleInstance": enabled });
    fs::write(&path, payload.to_string()).map_err(|e| format!("write failed: {e}"))?;
    Ok(())
}
