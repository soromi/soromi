//! Codex's headless-chat logic, kept entirely in the provider: how to build each turn's `codex exec`
//! command, and how to parse its `--json` events into the daemon's provider-agnostic [`ChatFrame`].
//! Codex runs one process per turn (`codex exec [resume <thread>] "<prompt>" --json`), emitting:
//!   {"type":"thread.started","thread_id":"…"}   {"type":"turn.started"}
//!   {"type":"item.completed","item":{…}}          {"type":"turn.completed","usage":{…}}

use serde_json::Value;
use soromi_protocol::{ChatEvent, PermissionMode, Status, ToolKind};

use crate::providers::ChatFrame;

/// The `codex exec` args for one turn: resume the thread when we have one, ask for JSON events, map
/// the permission mode to a sandbox, pass the model/effort, then the prompt.
pub fn turn_command(
    prompt: &str,
    resume_id: Option<&str>,
    model: Option<&str>,
    effort: Option<&str>,
    permission: PermissionMode,
) -> Vec<String> {
    let mut args = vec!["exec".to_string()];
    if let Some(id) = resume_id {
        args.push("resume".to_string());
        args.push(id.to_string());
    }
    args.push("--json".to_string());
    args.push("--skip-git-repo-check".to_string());
    // `exec` is non-interactive, so permission is a launch flag: Bypass runs unsandboxed; anything
    // else gets workspace-write (edits within the folder, no prompting).
    match permission {
        PermissionMode::BypassPermissions => {
            args.push("--dangerously-bypass-approvals-and-sandbox".to_string());
        }
        _ => {
            args.push("--sandbox".to_string());
            args.push("workspace-write".to_string());
        }
    }
    if let Some(model) = model {
        args.push("-m".to_string());
        args.push(model.to_string());
    }
    if let Some(effort) = effort {
        args.push("-c".to_string());
        args.push(format!("model_reasoning_effort=\"{effort}\""));
    }
    args.push(prompt.to_string());
    args
}

/// Parses one `codex exec --json` event line into a [`ChatFrame`].
pub fn parse_chat_frame(line: &str) -> ChatFrame {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return ChatFrame::Ignore;
    };
    match value.get("type").and_then(Value::as_str) {
        // The thread id is Codex's conversation id — capture it so later turns `resume` it.
        Some("thread.started") => value
            .get("thread_id")
            .and_then(Value::as_str)
            .map(|id| ChatFrame::SessionId(id.to_string()))
            .unwrap_or(ChatFrame::Ignore),
        Some("turn.started") => ChatFrame::Status(Status::Thinking),
        Some("item.completed") => item_event(value.get("item"))
            .map(|event| ChatFrame::Events(vec![event]))
            .unwrap_or(ChatFrame::Ignore),
        Some("turn.completed") => ChatFrame::Status(Status::Idle),
        _ => ChatFrame::Ignore,
    }
}

/// The turn's context size from a `turn.completed` frame (input + cached tokens), for the meter.
pub fn context_tokens(line: &str) -> Option<Option<u32>> {
    let value: Value = serde_json::from_str(line).ok()?;
    if value.get("type").and_then(Value::as_str) != Some("turn.completed") {
        return None;
    }
    let usage = value.get("usage")?;
    let field = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
    let total = field("input_tokens") + field("cached_input_tokens");
    (total > 0).then_some(Some(total as u32))
}

/// A completed Codex item -> a chat event: `agent_message` is assistant prose, `reasoning` a thinking
/// block, command/patch items render as tool cards. Unknown item types are skipped.
fn item_event(item: Option<&Value>) -> Option<ChatEvent> {
    let item = item?;
    let id = item
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("item")
        .to_string();
    match item.get("type").and_then(Value::as_str)? {
        "agent_message" => non_empty(item.get("text")).map(|text| ChatEvent::Assistant { text }),
        "reasoning" => non_empty(item.get("text")).map(|text| ChatEvent::Thinking { text }),
        "command_execution" => Some(ChatEvent::Tool {
            id,
            name: "shell".to_string(),
            path: None,
            body: non_empty(item.get("command")),
            tool_kind: ToolKind::Run,
        }),
        "file_change" | "patch" => Some(ChatEvent::Tool {
            id,
            name: "edit".to_string(),
            path: item.get("path").and_then(Value::as_str).map(str::to_string),
            body: None,
            tool_kind: ToolKind::Edit,
        }),
        _ => None,
    }
}

fn non_empty(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|s| !s.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_started_captures_the_session_id() {
        let frame = parse_chat_frame(r#"{"type":"thread.started","thread_id":"abc-123"}"#);
        assert!(matches!(frame, ChatFrame::SessionId(id) if id == "abc-123"));
    }

    #[test]
    fn agent_message_item_is_assistant_prose() {
        let line =
            r#"{"type":"item.completed","item":{"id":"i0","type":"agent_message","text":"pong"}}"#;
        match parse_chat_frame(line) {
            ChatFrame::Events(events) => {
                assert_eq!(
                    events,
                    vec![ChatEvent::Assistant {
                        text: "pong".into()
                    }]
                )
            }
            _ => panic!("expected an assistant event"),
        }
    }

    #[test]
    fn turn_lifecycle_maps_to_status() {
        assert!(matches!(
            parse_chat_frame(r#"{"type":"turn.started"}"#),
            ChatFrame::Status(Status::Thinking)
        ));
        assert!(matches!(
            parse_chat_frame(r#"{"type":"turn.completed","usage":{}}"#),
            ChatFrame::Status(Status::Idle)
        ));
    }

    #[test]
    fn turn_command_resumes_and_carries_the_prompt() {
        let args = turn_command(
            "hi",
            Some("t1"),
            Some("gpt-5"),
            None,
            PermissionMode::Default,
        );
        assert_eq!(args[0], "exec");
        assert_eq!(&args[1..3], ["resume", "t1"]);
        assert!(args.contains(&"--json".to_string()));
        assert_eq!(args.last().unwrap(), "hi");
    }
}
