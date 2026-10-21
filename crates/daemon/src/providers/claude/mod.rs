use std::io;
use std::path::{Path, PathBuf};

use serde_json::Value;
use soromi_protocol::{
    AgentUsage, ChatEvent, ChatFile, PermissionMode, ProviderModels, SlashCommand, Status,
};

use super::{Provider, UsageAuthState};

mod chat;
mod commands;
mod hooks;
mod status;
mod tasks;
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

    fn can_pin_session_id(&self) -> bool {
        // Claude pins the conversation to our `session.id` via `--session-id` above.
        true
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

    fn transcript_entry_id<'a>(&self, line: &'a str) -> Option<&'a str> {
        transcript::entry_id(line)
    }

    fn task_signals(&self, line: &str) -> Vec<super::TaskSignal> {
        tasks::task_signals(line)
    }

    fn plan_approval_body(&self, tool_name: &str, input: &serde_json::Value) -> Option<String> {
        // Claude proposes a plan by asking to run `ExitPlanMode`; its `plan` input is the plan itself.
        (tool_name == "ExitPlanMode")
            .then(|| {
                input
                    .get("plan")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            })
            .flatten()
    }

    fn model_catalog(&self) -> Option<ProviderModels> {
        const MILLION: u32 = 1_000_000;
        const STANDARD: u32 = 200_000;
        Some(ProviderModels {
            models: vec![
                // `None` = no explicit model; the daemon launches Opus 5.5 (see `model_commands`).
                //
                // `fable`, `sonnet` and `haiku` are the CLI's own aliases: each runs the newest
                // model of its family that the installed CLI knows, so the version named in the
                // description is only what that was when this list was last brought up to date
                // (Claude Code 2.1.286: Fable 5.1, Sonnet 5.5, Haiku 4.5).
                super::model_option(
                    None,
                    "Default",
                    "Opus 5.5 with 1M context · newest, best for everyday & complex tasks",
                    true,
                    MILLION,
                ),
                super::model_option(
                    Some("claude-opus-5[1m]"),
                    "Opus 5",
                    "Opus 5 with 1M context · the prior default",
                    true,
                    MILLION,
                ),
                super::model_option(
                    Some("claude-opus-4-8[1m]"),
                    "Opus 4.8",
                    "Opus 4.8 with 1M context · the prior Opus generation",
                    true,
                    MILLION,
                ),
                // Fable's window is 1M by default: its alias needs no `[1m]` to get it.
                super::model_option(
                    Some("fable"),
                    "Fable",
                    "Fable 5.1 with 1M context · most capable for your hardest, longest-running tasks",
                    true,
                    MILLION,
                ),
                super::model_option(
                    Some("sonnet"),
                    "Sonnet",
                    "Sonnet 5.5 · efficient for routine tasks",
                    false,
                    STANDARD,
                ),
                super::model_option(
                    Some("haiku"),
                    "Haiku",
                    "Haiku 4.5 · fastest for quick answers",
                    false,
                    STANDARD,
                ),
            ],
            effort_levels: ["low", "medium", "high", "xhigh", "max"]
                .map(String::from)
                .to_vec(),
            effort_labels: super::effort_labels(&[
                ("low", "Low"),
                ("medium", "Medium"),
                ("high", "High"),
                ("xhigh", "X-High"),
                ("max", "Max"),
            ]),
            default_effort: "high".to_string(),
        })
    }

    fn model_commands(&self, model: Option<&str>, effort: Option<&str>) -> Vec<String> {
        // Claude changes model/effort live by sending these as ordinary user messages. With no model
        // chosen (the GUI's "Default" option), launch the current default — Opus 5.5 at 1M context.
        let mut commands = vec![format!("/model {}", model.unwrap_or("claude-opus-5-5[1m]"))];
        if let Some(effort) = effort {
            commands.push(format!("/effort {effort}"));
        }
        commands
    }

    fn permission_flag(&self, mode: PermissionMode) -> Option<String> {
        // Claude's `--permission-mode` values (also the live `set_permission_mode` control arg).
        Some(mode.as_flag().to_string())
    }

    fn context_tokens(&self, line: &str) -> Option<Option<u32>> {
        chat::context_tokens(line)
    }

    fn parse_chat_frame(&self, line: &str) -> super::ChatFrame {
        chat::parse_chat_frame(self, line)
    }

    fn attachment_block(&self, file: &ChatFile) -> Option<Value> {
        Some(chat::attachment_block(file))
    }

    fn describe_command(&self, name: &str, cwd: &Path) -> Option<String> {
        commands::describe(name, cwd)
    }

    fn default_commands(&self, cwd: &Path) -> Vec<SlashCommand> {
        commands::defaults(cwd)
            .into_iter()
            .map(|name| SlashCommand {
                description: commands::describe(&name, cwd),
                name,
            })
            .collect()
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
        let args = Claude
            .headless_stream_json_args()
            .expect("claude has a headless mode");
        // Non-interactive, stream-json both directions, with partial (streaming) messages.
        assert!(args.contains(&"-p".to_string()));
        assert!(
            args.windows(2)
                .any(|w| w == ["--input-format", "stream-json"])
        );
        assert!(
            args.windows(2)
                .any(|w| w == ["--output-format", "stream-json"])
        );
        assert!(args.contains(&"--include-partial-messages".to_string()));
    }
}
