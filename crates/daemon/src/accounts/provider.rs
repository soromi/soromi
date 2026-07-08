use std::fs;
use std::path::Path;

use crate::config::{PROVIDERS, Provider};

use super::resolver::expand_home;

pub fn provider(key: &str) -> Option<&'static Provider> {
    PROVIDERS.iter().find(|p| p.key == key)
}

/// The env var a provider reads to find its config directory (e.g. `CLAUDE_CONFIG_DIR`).
pub fn config_env_var(key: &str) -> Option<&'static str> {
    provider(key).map(|p| p.config_env_var)
}

/// Whether a config directory looks logged in: the provider's credential file exists and, if
/// the provider requires it, carries a non-null account key (the token itself may be in the
/// keychain).
pub fn is_logged_in(provider_key: &str, config_dir: &str) -> bool {
    let Some(provider) = provider(provider_key) else {
        return false;
    };
    let home = dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let file = Path::new(&expand_home(config_dir, &home)).join(provider.credential_file);
    let Ok(contents) = fs::read_to_string(&file) else {
        return false;
    };
    match provider.credential_key {
        None => true,
        Some(key) => serde_json::from_str::<serde_json::Value>(&contents)
            .ok()
            .and_then(|value| value.get(key).cloned())
            .is_some_and(|value| !value.is_null()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_providers_to_env_vars() {
        assert_eq!(config_env_var("claude"), Some("CLAUDE_CONFIG_DIR"));
        assert_eq!(config_env_var("codex"), Some("CODEX_HOME"));
        assert_eq!(config_env_var("unknown"), None);
    }

    #[test]
    fn detects_a_logged_in_claude_directory() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        // No config file yet.
        assert!(!is_logged_in("claude", path));
        // Config file present but no account key -> still not logged in.
        std::fs::write(dir.path().join(".claude.json"), r#"{ "numStartups": 3 }"#).unwrap();
        assert!(!is_logged_in("claude", path));
        // Account key present -> logged in.
        std::fs::write(
            dir.path().join(".claude.json"),
            r#"{ "oauthAccount": { "emailAddress": "a@b.co" } }"#,
        )
        .unwrap();
        assert!(is_logged_in("claude", path));
        // Unknown providers are never "logged in".
        assert!(!is_logged_in("nope", path));
    }

    #[test]
    fn detects_a_codex_directory_by_file_presence() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        assert!(!is_logged_in("codex", path));
        std::fs::write(dir.path().join("auth.json"), "{}").unwrap();
        assert!(is_logged_in("codex", path));
    }
}
