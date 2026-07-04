use std::fs;
use std::path::{Path, PathBuf};

use soromi_protocol::AccountProfile;

use crate::home::soromi_home;

/// Root of the account profile store: `<SOROMI_HOME>/accounts`.
pub fn accounts_dir() -> PathBuf {
    soromi_home().join("accounts")
}

/// Reads and validates the profile at `<dir>/<name>/profile.json`.
pub fn load_account_profile(name: &str, dir: &Path) -> anyhow::Result<AccountProfile> {
    let file = dir.join(name).join("profile.json");
    let raw = fs::read_to_string(&file).map_err(|_| {
        anyhow::anyhow!("account profile \"{name}\" not found ({})", file.display())
    })?;
    let profile: AccountProfile = serde_json::from_str(&raw).map_err(|error| {
        anyhow::anyhow!(
            "account profile \"{name}\" is invalid ({}): {error}",
            file.display()
        )
    })?;
    Ok(profile)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn loads_a_valid_profile() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("work")).unwrap();
        fs::write(
            dir.path().join("work/profile.json"),
            r#"{ "name": "work", "providers": { "claude": { "configDir": "~/x" } } }"#,
        )
        .unwrap();

        let profile = load_account_profile("work", dir.path()).unwrap();
        assert_eq!(profile.name, "work");
        assert_eq!(
            profile.providers["claude"].config_dir.as_deref(),
            Some("~/x")
        );
    }

    #[test]
    fn errors_when_missing() {
        let dir = tempdir().unwrap();
        assert!(load_account_profile("nope", dir.path()).is_err());
    }
}
