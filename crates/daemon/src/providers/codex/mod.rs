use std::io;
use std::path::Path;

use soromi_protocol::AgentUsage;

use super::{Provider, UsageAuthState};

mod hooks;
mod usage;

/// OpenAI's Codex CLI.
pub struct Codex;

impl Provider for Codex {
    fn key(&self) -> &'static str {
        "codex"
    }

    fn config_env_var(&self) -> &'static str {
        "CODEX_HOME"
    }

    fn default_config_dir(&self) -> &'static str {
        ".codex"
    }

    // Codex's presence of `auth.json` is enough (no account key to check).
    fn credential_file(&self) -> &'static str {
        "auth.json"
    }

    // Codex has no add-dir or per-session system-prompt flag, so those stay `None` (defaults).

    fn apply_resume(&self, args: &mut Vec<String>, resume_id: &str) {
        // Codex resumes with a leading `resume <id>` subcommand, prepended to its launch args.
        args.insert(0, resume_id.to_string());
        args.insert(0, "resume".to_string());
    }

    fn skill_dirs(&self) -> Option<(&'static str, &'static str)> {
        Some((".codex", "prompts"))
    }

    fn install_hooks(&self, config_dir: &Path) -> io::Result<()> {
        hooks::install(config_dir)
    }

    fn usage_auth(&self, config_dir: &Path) -> UsageAuthState {
        usage::auth(config_dir)
    }

    fn parse_usage(&self, body: &[u8]) -> Option<AgentUsage> {
        usage::parse(body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn is_logged_in_by_file_presence() {
        let dir = tempdir().unwrap();
        assert!(!Codex.is_logged_in(dir.path()));
        std::fs::write(dir.path().join("auth.json"), "{}").unwrap();
        assert!(Codex.is_logged_in(dir.path()));
    }
}
