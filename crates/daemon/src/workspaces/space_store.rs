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
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));

        assert!(load_spaces().is_empty());
        let spaces = vec![PersistedSpace {
            name: "kazomi".into(),
            folders: vec![".".into()],
            root: "/w/kazomi".into(),
            accounts: vec![soromi_protocol::AgentAccount {
                id: "personal".into(),
                agent: "claude".into(),
            }],
            sessions: vec![crate::workspaces::config::SessionSpec {
                id: "s1".into(),
                agent: "claude".into(),
                title: None,
                resume_id: None,
            }],
            instructions: None,
            agent: None,
            account: None,
        }];
        save_spaces(&spaces);
        assert_eq!(load_spaces(), spaces);

        crate::home::set_soromi_home(None);
    }
}
