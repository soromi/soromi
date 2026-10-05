use std::io;
use std::path::Path;

use soromi_protocol::{AgentUsage, PermissionMode, ProviderModels, Status};

use super::{ChatFrame, Provider, UsageAuthState};

mod chat;
mod hooks;
mod status;
mod usage;

/// OpenAI's Codex CLI.
pub struct Codex;

impl Provider for Codex {
    fn key(&self) -> &'static str {
        "codex"
    }

    fn model_catalog(&self) -> Option<ProviderModels> {
        // Codex applies the model per turn via `-m <slug>`; `None` (the GUI's "Default") is resolved
        // to GPT-6 Astra in `turn_command`. 272k is Codex's real default `context_window` for these
        // models (max_context_window 872k is the opt-in extended context); it sizes the meter.
        const CODEX_CONTEXT: u32 = 272_000;
        Some(ProviderModels {
            models: vec![
                super::model_option(
                    None,
                    "Default",
                    "GPT-6 Astra · newest, most capable",
                    true,
                    CODEX_CONTEXT,
                ),
                super::model_option(
                    Some("gpt-5.6-terra"),
                    "GPT-5.6 Terra",
                    "High capability",
                    true,
                    CODEX_CONTEXT,
                ),
                super::model_option(
                    Some("gpt-5.6-luna"),
                    "GPT-5.6 Luna",
                    "Faster, lighter",
                    true,
                    CODEX_CONTEXT,
                ),
            ],
            effort_levels: ["low", "medium", "high", "xhigh"]
                .map(String::from)
                .to_vec(),
            effort_labels: super::effort_labels(&[
                ("low", "Low"),
                ("medium", "Medium"),
                ("high", "High"),
                ("xhigh", "X-High"),
            ]),
            default_effort: "high".to_string(),
        })
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

    fn parse_status(&self, chunk: &str) -> Option<Status> {
        status::parse(chunk)
    }

    // Codex's headless chat runs one `codex exec` process per turn (unlike Claude's single persistent
    // stream-json process). All of its parsing + command-building lives in `chat`.
    fn chat_is_per_turn(&self) -> bool {
        true
    }

    fn chat_turn_command(
        &self,
        prompt: &str,
        resume_id: Option<&str>,
        model: Option<&str>,
        effort: Option<&str>,
        permission: PermissionMode,
    ) -> Option<Vec<String>> {
        Some(chat::turn_command(
            prompt, resume_id, model, effort, permission,
        ))
    }

    fn parse_chat_frame(&self, line: &str) -> ChatFrame {
        chat::parse_chat_frame(line)
    }

    fn context_tokens(&self, line: &str) -> Option<Option<u32>> {
        chat::context_tokens(line)
    }

    // Codex writes a "rollout" JSONL transcript, but its schema differs from Claude's and Soromi
    // does not yet capture Codex's transcript path (the notify bridge reports only the session id).
    // So `parse_transcript_line` stays the default (no events) until both are wired; the seam is
    // ready for it. Codex still gets live status from `parse_status` + its notify hooks.
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

    #[test]
    fn cannot_pin_a_caller_chosen_session_id() {
        // Codex only issues its own ids, so Soromi's `session.id` must never be resumed — the launch
        // logic gates on this so a fresh tab starts clean instead of `codex resume <soromi-uuid>`.
        assert!(!Codex.can_pin_session_id());
    }

    #[test]
    fn resume_prepends_the_resume_subcommand() {
        let mut args = vec!["--model".to_string(), "gpt-5".to_string()];
        Codex.apply_resume(&mut args, "real-codex-id");
        assert_eq!(args, ["resume", "real-codex-id", "--model", "gpt-5"]);
    }
}
