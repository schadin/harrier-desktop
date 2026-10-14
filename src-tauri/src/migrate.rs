use std::fs;
use std::path::Path;

const OLD_IDENTIFIER: &str = "in.cinny.app";
const NEW_IDENTIFIER: &str = "io.github.schadin.harrier";
const MARKER_FILE: &str = "migration.success";

use crate::paths;

fn copy_dir_no_overwrite(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_no_overwrite(&src_path, &dst_path)?;
        } else if file_type.is_file() && !dst_path.exists() {
            if let Err(e) = fs::copy(&src_path, &dst_path) {
                eprintln!("migrate: failed to copy {}: {}", src_path.display(), e);
            }
        }
    }
    Ok(())
}

fn dir_is_empty(path: &Path) -> bool {
    fs::read_dir(path)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(true)
}

fn create_marker(new_config_dir: &Path) {
    if let Err(e) = fs::write(new_config_dir.join(MARKER_FILE), "") {
        eprintln!("migrate: failed to create marker: {}", e);
    }
}

pub fn migrate_settings() {
    let (Some(old_config), Some(new_config)) = (
        paths::base_config_dir().map(|d| d.join(OLD_IDENTIFIER)),
        paths::base_config_dir().map(|d| d.join(NEW_IDENTIFIER)),
    ) else {
        return;
    };
    let old_data = paths::base_data_dir().map(|d| d.join(OLD_IDENTIFIER));
    let new_data = paths::base_data_dir().map(|d| d.join(NEW_IDENTIFIER));

    if new_config.join(MARKER_FILE).exists() {
        return;
    }

    let old_exists = old_config.exists()
        || old_data
            .as_ref()
            .map(|d| d.exists())
            .unwrap_or(false);

    if !old_exists {
        if let Err(e) = fs::create_dir_all(&new_config) {
            eprintln!("migrate: failed to create config dir: {}", e);
            return;
        }
        create_marker(&new_config);
        return;
    }

    if (new_config.exists() && !dir_is_empty(&new_config))
        || new_data
            .as_ref()
            .map(|d| d.exists() && !dir_is_empty(d))
            .unwrap_or(false)
    {
        create_marker(&new_config);
        return;
    }

    if let Err(e) = fs::create_dir_all(&new_config) {
        eprintln!("migrate: failed to create config dir: {}", e);
        return;
    }

    if let Err(e) = copy_dir_no_overwrite(&old_config, &new_config) {
        eprintln!("migrate: config copy failed: {}", e);
    }
    if let (Some(old_data), Some(new_data)) = (&old_data, &new_data) {
        if *old_data != old_config && *new_data != new_config {
            if let Err(e) = copy_dir_no_overwrite(old_data, new_data) {
                eprintln!("migrate: data copy failed: {}", e);
            }
        }
    }

    create_marker(&new_config);
}
