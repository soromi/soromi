use std::io;
use std::path::Path;

use soromi_protocol::AgentUsage;

use super::{Provider, UsageAuthState};

mod hooks;
mod usage;

/// Anthropic's Claude Code.
pub struct Claude;

impl Provider for Claude {
    fn key(&self) -> &'static str {
        "claude"
    }

    fn config_env_var(&self) -> &'static str {
        "CLAUDE_CONFIG_DIR"
    }

    fn default_config_dir(&self) -> &'static str {
        ".claude"
    }

    // Claude keeps the token in the keychain; `.claude.json` gains an `oauthAccount` on login.
    fn credential_file(&self) -> &'static str {
        ".claude.json"
    }

    fn credential_key(&self) -> Option<&'static str> {
        Some("oauthAccount")
    }

    fn add_dir_flag(&self) -> Option<&'static str> {
        Some("--add-dir")
    }

    fn system_prompt_flag(&self) -> Option<&'static str> {
        Some("--append-system-prompt")
    }

    fn apply_resume(&self, args: &mut Vec<String>, resume_id: &str) {
        // Claude resumes with a `--resume <id>` flag appended to its launch args.
        args.push("--resume".to_string());
        args.push(resume_id.to_string());
    }

    fn resume_available(&self, config_dir: &Path, cwd: &str, resume_id: &str) -> bool {
        // Claude saves each conversation to `<config>/projects/<cwd>/<id>.jsonl`, encoding the cwd
        // by replacing every non-alphanumeric char with `-`. If that file is absent the conversation
        // was never persisted (or is under a different cwd), so resuming it would fail.
        let encoded: String = cwd
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();

        config_dir
            .join("projects")
            .join(encoded)
            .join(format!("{resume_id}.jsonl"))
            .exists()
    }

    fn skill_dirs(&self) -> Option<(&'static str, &'static str)> {
        Some((".claude", "commands"))
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
    fn resume_available_only_when_the_conversation_file_exists() {
        let dir = tempdir().unwrap();
        let cwd = "/Users/me/work/bookr/front_library";
        let id = "fab3dde6-38a9-4af8-b20d-d25814b8cf2c";

        // No file yet (an unused / never-saved conversation): not resumable.
        assert!(!Claude.resume_available(dir.path(), cwd, id));

        // Claude encodes the cwd by replacing every non-alphanumeric char with `-`.
        let project = dir
            .path()
            .join("projects")
            .join("-Users-me-work-bookr-front-library");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(project.join(format!("{id}.jsonl")), "{}").unwrap();

        assert!(Claude.resume_available(dir.path(), cwd, id));
    }

    #[test]
    fn is_logged_in_checks_the_account_key() {
        let dir = tempdir().unwrap();
        let path = dir.path();

        assert!(!Claude.is_logged_in(path));
        std::fs::write(path.join(".claude.json"), r#"{ "numStartups": 3 }"#).unwrap();
        assert!(!Claude.is_logged_in(path));
        std::fs::write(
            path.join(".claude.json"),
            r#"{ "oauthAccount": { "emailAddress": "a@b.co" } }"#,
        )
        .unwrap();
        assert!(Claude.is_logged_in(path));
    }
}
