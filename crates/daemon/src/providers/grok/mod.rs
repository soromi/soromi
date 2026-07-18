use std::io;
use std::path::Path;

use super::Provider;

mod hooks;

/// xAI's Grok Build (`grok`). Config lives in `~/.grok`, isolated per account via `GROK_HOME`;
/// `grok login` writes `auth.json`. Hooks are Claude-Code-shaped JSON files under `<config>/hooks/`.
/// No multi-folder or resume flags today, so (like Codex) a tab runs at the workspace's first
/// folder and starts fresh. Usage is not wired (Grok exposes it over a stdio JSON-RPC, not HTTP).
pub struct Grok;

impl Provider for Grok {
    fn key(&self) -> &'static str {
        "grok"
    }

    fn config_env_var(&self) -> &'static str {
        "GROK_HOME"
    }

    fn default_config_dir(&self) -> &'static str {
        ".grok"
    }

    // `grok login` writes `auth.json` (identity + token) into the config dir; its presence marks
    // the account as signed in.
    fn credential_file(&self) -> &'static str {
        "auth.json"
    }

    fn install_hooks(&self, config_dir: &Path) -> io::Result<()> {
        hooks::install(config_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_logged_in_when_the_auth_file_exists() {
        let dir = tempfile::tempdir().unwrap();

        assert!(!Grok.is_logged_in(dir.path()));
        std::fs::write(dir.path().join("auth.json"), r#"{ "email": "a@b.co" }"#).unwrap();
        assert!(Grok.is_logged_in(dir.path()));
    }
}
