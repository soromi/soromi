use std::path::Path;

use crate::providers::provider;

use super::resolver::expand_home;

/// The env var a provider reads to find its config directory (e.g. `CLAUDE_CONFIG_DIR`).
pub fn config_env_var(key: &str) -> Option<&'static str> {
    provider(key).map(|p| p.config_env_var())
}

/// Whether a config directory looks logged in for a provider (delegates to the provider's own
/// credential check). `config_dir` may use `~`; it is expanded against the home dir.
pub fn is_logged_in(provider_key: &str, config_dir: &str) -> bool {
    let Some(provider) = provider(provider_key) else {
        return false;
    };
    let home = dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();

    provider.is_logged_in(Path::new(&expand_home(config_dir, &home)))
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
    fn expands_and_checks_a_logged_in_directory() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        assert!(!is_logged_in("claude", path));
        std::fs::write(
            dir.path().join(".claude.json"),
            r#"{ "oauthAccount": { "emailAddress": "a@b.co" } }"#,
        )
        .unwrap();
        assert!(is_logged_in("claude", path));
        // Unknown providers are never "logged in".
        assert!(!is_logged_in("nope", path));
    }
}
