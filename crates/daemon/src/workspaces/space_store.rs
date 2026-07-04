use std::fs;
use std::path::PathBuf;

use super::config::PersistedSpace;
use crate::home::soromi_home;

fn spaces_file() -> PathBuf {
    soromi_home().join("spaces.json")
}

/// Loads persisted spaces; returns `[]` if the file is missing or invalid.
pub fn load_spaces() -> Vec<PersistedSpace> {
    let Ok(raw) = fs::read_to_string(spaces_file()) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Writes the current spaces to disk under `~/.soromi/` (or `SOROMI_HOME`).
pub fn save_spaces(spaces: &[PersistedSpace]) {
    let file = spaces_file();
    if let Some(parent) = file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(spaces) {
        let _ = fs::write(&file, format!("{json}\n"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[serial_test::serial]
    fn round_trips_spaces_through_disk() {
        let home = tempfile::tempdir().unwrap();
        std::env::set_var("SOROMI_HOME", home.path());

        assert!(load_spaces().is_empty());
        let spaces = vec![PersistedSpace {
            name: "kazomi".into(),
            folders: vec![".".into()],
            agent: "claude".into(),
            account: "personal".into(),
            defaults: None,
            root: "/w/kazomi".into(),
        }];
        save_spaces(&spaces);
        assert_eq!(load_spaces(), spaces);

        std::env::remove_var("SOROMI_HOME");
    }
}
