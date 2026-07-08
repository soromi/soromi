use std::fs;

use soromi_protocol::AccountProfile;

use super::loader::accounts_dir;

/// CRUD over the account profiles the daemon exposes to the UI. Profiles live under
/// `<SOROMI_HOME>/accounts/<name>/profile.json`.
pub struct FileAccountManager;

impl FileAccountManager {
    pub fn list(&self) -> Vec<AccountProfile> {
        let dir = accounts_dir();
        let Ok(entries) = fs::read_dir(&dir) else {
            return Vec::new();
        };
        let mut profiles: Vec<AccountProfile> = entries
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let raw = fs::read_to_string(entry.path().join("profile.json")).ok()?;
                serde_json::from_str::<AccountProfile>(&raw).ok()
            })
            .collect();
        profiles.sort_by(|a, b| a.name.cmp(&b.name));
        profiles
    }

    pub fn save(&self, profile: &AccountProfile) -> anyhow::Result<()> {
        let dir = accounts_dir().join(safe_name(&profile.name)?);
        fs::create_dir_all(&dir)?;
        let json = serde_json::to_string_pretty(profile)?;
        fs::write(dir.join("profile.json"), format!("{json}\n"))?;
        Ok(())
    }

    pub fn remove(&self, name: &str) -> anyhow::Result<()> {
        let dir = accounts_dir().join(safe_name(name)?);
        let _ = fs::remove_dir_all(dir);
        Ok(())
    }
}

fn safe_name(name: &str) -> anyhow::Result<&str> {
    let ok = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'));
    if ok {
        Ok(name)
    } else {
        anyhow::bail!("invalid account name: {name}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn rejects_path_traversal_names() {
        assert!(safe_name("../evil").is_err());
        assert!(safe_name("a/b").is_err());
        assert!(safe_name("").is_err());
        assert_eq!(safe_name("work-1.2").unwrap(), "work-1.2");
    }

    #[test]
    #[serial_test::serial]
    fn round_trips_a_profile_through_the_store() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));

        let manager = FileAccountManager;
        let profile = AccountProfile {
            name: "work".into(),
            providers: HashMap::new(),
        };
        manager.save(&profile).unwrap();
        assert_eq!(manager.list(), vec![profile]);
        manager.remove("work").unwrap();
        assert!(manager.list().is_empty());

        crate::home::set_soromi_home(None);
    }
}
