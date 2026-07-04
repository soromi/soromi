use std::fs;
use std::path::{Path, PathBuf};

use super::config::Workspace;

pub struct LoadedWorkspace {
    pub workspace: Workspace,
    /// Absolute path to the work-folder root that holds the folders.
    pub root: String,
}

/// Reads and validates `<dir>/soromi.space.json`, resolving the work-folder root.
pub fn load_workspace(dir: &str) -> anyhow::Result<LoadedWorkspace> {
    let root: PathBuf = if Path::new(dir).is_absolute() {
        PathBuf::from(dir)
    } else {
        std::env::current_dir()?.join(dir)
    };
    let file = root.join("soromi.space.json");

    let raw = fs::read_to_string(&file)
        .map_err(|_| anyhow::anyhow!("no soromi.space.json found at {}", file.display()))?;
    let workspace: Workspace = serde_json::from_str(&raw).map_err(|error| {
        anyhow::anyhow!("soromi.space.json is invalid ({}): {error}", file.display())
    })?;
    validate_folders(&workspace.folders)?;

    Ok(LoadedWorkspace {
        workspace,
        root: root.to_string_lossy().into_owned(),
    })
}

/// A `soromi.space.json` is committable, so folder paths must be relative and must not escape
/// the workspace root (absolute paths leak machine layout; `..` escapes).
fn validate_folders(folders: &[String]) -> anyhow::Result<()> {
    if folders.is_empty() {
        anyhow::bail!("soromi.space.json: folders must not be empty");
    }
    for folder in folders {
        let windows_absolute = folder.as_bytes().get(1).is_some_and(|&b| b == b':')
            && folder
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_alphabetic());
        if folder.starts_with('/') || windows_absolute {
            anyhow::bail!("folder path must be relative, not absolute: {folder}");
        }
        if folder.split(['/', '\\']).any(|part| part == "..") {
            anyhow::bail!("folder path must not escape the workspace root: {folder}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn loads_a_valid_space_file() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join("soromi.space.json"),
            r#"{ "name": "kazomi", "folders": ["."], "agent": "claude", "account": "personal" }"#,
        )
        .unwrap();

        let loaded = load_workspace(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(loaded.workspace.name, "kazomi");
        assert_eq!(loaded.workspace.folders, vec![".".to_string()]);
    }

    #[test]
    fn errors_when_missing() {
        let dir = tempdir().unwrap();
        assert!(load_workspace(dir.path().to_str().unwrap()).is_err());
    }

    #[test]
    fn rejects_escaping_folders() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join("soromi.space.json"),
            r#"{ "name": "x", "folders": ["../evil"], "agent": "claude", "account": "personal" }"#,
        )
        .unwrap();
        assert!(load_workspace(dir.path().to_str().unwrap()).is_err());
    }
}
