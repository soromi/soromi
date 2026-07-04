use std::path::PathBuf;

use soromi_protocol::AccountProfile;

/// Expands a leading `~` to the home directory; leaves other values untouched.
pub fn expand_home(value: &str, home: &str) -> String {
    if value == "~" {
        return home.to_string();
    }
    if let Some(rest) = value.strip_prefix("~/") {
        return PathBuf::from(home)
            .join(rest)
            .to_string_lossy()
            .into_owned();
    }
    value.to_string()
}

/// The environment to launch a provider's agent under.
pub struct ResolvedLaunch {
    pub env: Vec<(String, String)>,
    /// Config directories to create before launch (from the provider's `configDir`).
    pub ensure_dirs: Vec<String>,
}

/// Produces the environment to launch a provider's agent under, isolated by the account
/// profile. The provider's env is layered over the base env (values `~`-expanded), so the
/// daemon needs no per-provider knowledge. A provider absent from the profile launches under
/// the base env unchanged.
pub fn resolve_launch_env(
    profile: &AccountProfile,
    provider_key: &str,
    base_env: &[(String, String)],
) -> ResolvedLaunch {
    let home = dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();

    let Some(provider) = profile.providers.get(provider_key) else {
        return ResolvedLaunch {
            env: base_env.to_vec(),
            ensure_dirs: Vec::new(),
        };
    };

    let mut env = base_env.to_vec();
    if let Some(provider_env) = &provider.env {
        for (key, value) in provider_env {
            upsert(&mut env, key, expand_home(value, &home));
        }
    }

    let ensure_dirs = provider
        .config_dir
        .as_ref()
        .map(|dir| vec![expand_home(dir, &home)])
        .unwrap_or_default();

    ResolvedLaunch { env, ensure_dirs }
}

fn upsert(env: &mut Vec<(String, String)>, key: &str, value: String) {
    if let Some(entry) = env.iter_mut().find(|(k, _)| k == key) {
        entry.1 = value;
    } else {
        env.push((key.to_string(), value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soromi_protocol::ProviderConfig;
    use std::collections::HashMap;

    #[test]
    fn expands_a_leading_tilde() {
        assert_eq!(expand_home("~", "/home/j"), "/home/j");
        assert_eq!(expand_home("~/x/y", "/home/j"), "/home/j/x/y");
        assert_eq!(expand_home("/abs", "/home/j"), "/abs");
    }

    fn profile_with(provider: &str, config: ProviderConfig) -> AccountProfile {
        let mut providers = HashMap::new();
        providers.insert(provider.to_string(), config);
        AccountProfile {
            name: "work".into(),
            providers,
        }
    }

    #[test]
    fn layers_provider_env_over_the_base() {
        let mut penv = HashMap::new();
        penv.insert("CLAUDE_CONFIG_DIR".to_string(), "~/c".to_string());
        let profile = profile_with(
            "claude",
            ProviderConfig {
                env: Some(penv),
                config_dir: Some("~/c".into()),
            },
        );

        let base = vec![("PATH".to_string(), "/usr/bin".to_string())];
        let resolved = resolve_launch_env(&profile, "claude", &base);

        assert!(resolved.env.iter().any(|(k, _)| k == "PATH"));
        let claude = resolved
            .env
            .iter()
            .find(|(k, _)| k == "CLAUDE_CONFIG_DIR")
            .unwrap();
        assert!(!claude.1.starts_with('~'));
        assert_eq!(resolved.ensure_dirs.len(), 1);
    }

    #[test]
    fn unknown_provider_uses_the_base_env() {
        let profile = profile_with(
            "claude",
            ProviderConfig {
                env: None,
                config_dir: None,
            },
        );
        let base = vec![("PATH".to_string(), "/usr/bin".to_string())];
        let resolved = resolve_launch_env(&profile, "codex", &base);
        assert_eq!(resolved.env, base);
        assert!(resolved.ensure_dirs.is_empty());
    }
}
