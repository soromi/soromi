use std::io;
use std::path::{Path, PathBuf};

use soromi_protocol::{AgentUsage, ChatEvent, Status};

use super::{Provider, UsageAuthState};

mod commands;
mod hooks;
mod status;
mod transcript;
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

    fn apply_session_id(&self, args: &mut Vec<String>, id: &str) {
        // Start a fresh conversation with a caller-chosen id (must be a valid UUID - Soromi's session
        // ids are). Lets us `--resume <id>` later from either backend without discovering the id.
        args.push("--session-id".to_string());
        args.push(id.to_string());
    }

    fn headless_stream_json_args(&self) -> Option<Vec<String>> {
        // Non-interactive, bidirectional stream-json: we write user turns to stdin and read frames off
        // stdout. `--include-partial-messages` gives token deltas. `--permission-prompt-tool stdio`
        // (hidden flag) routes tool approvals over the stdio control channel: the CLI asks with a
        // `can_use_tool` control_request and we answer allow/deny — real permissions, no bypass. Safe
        // commands still auto-approve. `AskUserQuestion` (interactive multiple-choice) is disabled by
        // the CLI in print mode — if the agent tries it the turn dies with a `tool_use_error`, so we
        // disallow it up front and the model asks in prose instead.
        Some(
            [
                "-p",
                "--input-format",
                "stream-json",
                "--output-format",
                "stream-json",
                "--verbose",
                "--include-partial-messages",
                "--permission-prompt-tool",
                "stdio",
                "--disallowed-tools",
                "AskUserQuestion",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect(),
        )
    }

    fn resume_available(&self, config_dir: &Path, cwd: &str, resume_id: &str) -> bool {
        // Resumable iff the conversation file exists; absent means it was never persisted (or is
        // under a different cwd), so `--resume` would error.
        self.transcript_path(config_dir, cwd, resume_id)
            .is_some_and(|path| path.exists())
    }

    fn transcript_path(&self, config_dir: &Path, cwd: &str, id: &str) -> Option<PathBuf> {
        // Claude saves each conversation to `<config>/projects/<cwd>/<id>.jsonl`, encoding the cwd by
        // replacing every non-alphanumeric char with `-`.
        let encoded: String = cwd
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();
        Some(
            config_dir
                .join("projects")
                .join(encoded)
                .join(format!("{id}.jsonl")),
        )
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

    fn parse_status(&self, chunk: &str) -> Option<Status> {
        status::parse(chunk)
    }

    fn parse_transcript_line(&self, line: &str) -> Vec<ChatEvent> {
        transcript::parse_line(line)
    }

    fn describe_command(&self, name: &str, cwd: &Path) -> Option<String> {
        commands::describe(name, cwd)
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

    #[test]
    fn headless_args_request_bidirectional_stream_json() {
        let args = Claude.headless_stream_json_args().expect("claude has a headless mode");
        // Non-interactive, stream-json both directions, with partial (streaming) messages.
        assert!(args.contains(&"-p".to_string()));
        assert!(args.windows(2).any(|w| w == ["--input-format", "stream-json"]));
        assert!(args.windows(2).any(|w| w == ["--output-format", "stream-json"]));
        assert!(args.contains(&"--include-partial-messages".to_string()));
    }
}
