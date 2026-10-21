//! What Claude says about the agents it runs beside the conversation: when one starts, that it is
//! still at work, and when it stops. The session layer keeps the "agents working" list from this
//! (see `sessions::subagents`), so it never reads Claude's fields or wording itself.
//!
//! The same facts arrive in two shapes, and both are read here:
//!
//! - **On the live stream** (a chat session), as structured `system` frames: `task_started`,
//!   `task_progress`, `task_updated` and `task_notification`.
//! - **In the transcript** (a terminal session, which is followed by reading the file), as text:
//!   the tool result that acknowledges a background launch, a `SendMessage` to an agent, and the
//!   `<task-notification>` Claude hands the main agent as a user-role message when one stops.
//!
//! A stream carries the transcript's shapes too, so a chat session may hear the same thing twice.
//! Every signal says what is true rather than what changed, so twice is harmless.

use serde_json::Value;

use crate::providers::TaskSignal;

/// The kinds of task that are agents: one started with the agent tool, one running elsewhere, a
/// teammate, and a workflow (which is agents under one name). Background shell commands, monitors
/// and the like are tasks too, but they are not agents and are not listed as such.
const AGENT_TASKS: [&str; 4] = [
    "local_agent",
    "remote_agent",
    "in_process_teammate",
    "local_workflow",
];

/// The states a task does not come back from on its own.
const ENDED: [&str; 5] = ["completed", "failed", "killed", "stopped", "cancelled"];

/// How the tool result for a background launch begins, and what precedes the agent's id in it.
const LAUNCH_ACK: &str = "Async agent launched";
const LAUNCH_ID: &str = "agentId: ";

/// What opens the note Claude gives the main agent when a background task stops.
const NOTIFICATION: &str = "<task-notification>";

/// A background task stopped, as the `<task-notification>` text tells it.
pub(super) struct Notification<'a> {
    pub task: &'a str,
    /// The tool call that started the task, or the message that resumed it.
    pub tool: Option<&'a str>,
    /// One line for a person: `Agent "Map the billing popup" finished`.
    pub summary: &'a str,
}

/// Reads a `<task-notification>` out of a user-role message, or `None` if `text` is not one.
pub(super) fn notification(text: &str) -> Option<Notification<'_>> {
    let start = text.find(NOTIFICATION)?;
    let body = &text[start..];

    Some(Notification {
        task: tag(body, "task-id")?,
        tool: tag(body, "tool-use-id"),
        summary: tag(body, "summary").unwrap_or_default(),
    })
}

/// Everything one line (a stream frame or a transcript entry) says about background agents.
pub fn task_signals(line: &str) -> Vec<TaskSignal> {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return Vec::new();
    };
    // A sub-agent's own conversation is interleaved with the main one. What it starts and hears
    // about is its business, and reaches the main agent through it.
    if value.get("isSidechain").and_then(Value::as_bool) == Some(true)
        || value
            .get("parent_tool_use_id")
            .is_some_and(|id| !id.is_null())
    {
        return Vec::new();
    }
    match value.get("type").and_then(Value::as_str) {
        Some("system") => from_task_frame(&value).into_iter().collect(),
        Some("user") => from_user(&value),
        Some("assistant") => from_assistant(&value),
        _ => Vec::new(),
    }
}

/// A structured task frame from the live stream.
fn from_task_frame(value: &Value) -> Option<TaskSignal> {
    let text = |key: &str| {
        value
            .get(key)
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    };
    let task = text("task_id")?;
    let tool = text("tool_use_id");
    match value.get("subtype").and_then(Value::as_str)? {
        "task_started" => {
            let kind = value.get("task_type").and_then(Value::as_str)?;
            // One started by a sub-agent belongs to that sub-agent, not to this conversation.
            let nested = value
                .get("owned_by_subagent")
                .is_some_and(|owner| !owner.is_null() && owner != &Value::Bool(false));
            if !AGENT_TASKS.contains(&kind) || nested {
                return None;
            }
            Some(TaskSignal::Running {
                task,
                tool,
                name: text("workflow_name").or_else(|| text("description")),
                background: value.get("is_backgrounded").and_then(Value::as_bool),
            })
        }
        // Only agents report a type of their own; a shell command's progress says nothing here.
        "task_progress" => {
            text("subagent_type")?;
            Some(TaskSignal::Running {
                task,
                tool,
                name: text("description"),
                background: None,
            })
        }
        "task_updated" => {
            let patch = value.get("patch")?;
            let status = patch.get("status").and_then(Value::as_str);
            if status.is_some_and(|status| ENDED.contains(&status)) {
                return Some(TaskSignal::Ended {
                    task,
                    tool,
                    name: None,
                });
            }
            // It was sent to the background while it ran: it will outlast the call that started it.
            (patch.get("is_backgrounded").and_then(Value::as_bool) == Some(true)).then_some(
                TaskSignal::Running {
                    task,
                    tool,
                    name: None,
                    background: Some(true),
                },
            )
        }
        "task_notification" => Some(TaskSignal::Ended {
            task,
            tool,
            name: text("summary")
                .as_deref()
                .and_then(quoted)
                .map(str::to_string),
        }),
        _ => None,
    }
}

/// A user-role entry: a notification that a task stopped, or tool results, one of which may be
/// the acknowledgement of a background launch.
fn from_user(value: &Value) -> Vec<TaskSignal> {
    let Some(content) = value.pointer("/message/content") else {
        return Vec::new();
    };
    if let Some(text) = content.as_str() {
        return ended(text).into_iter().collect();
    }
    let Some(blocks) = content.as_array() else {
        return Vec::new();
    };

    blocks
        .iter()
        .filter_map(|block| match block.get("type").and_then(Value::as_str)? {
            "text" => ended(block.get("text").and_then(Value::as_str)?),
            "tool_result" => {
                let text = result_text(block.get("content")?);
                let task = launched(&text)?;
                Some(TaskSignal::Running {
                    task: task.to_string(),
                    tool: block
                        .get("tool_use_id")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    name: None,
                    background: Some(true),
                })
            }
            _ => None,
        })
        .collect()
}

/// An assistant entry: a message sent to a background agent sets it going again.
fn from_assistant(value: &Value) -> Vec<TaskSignal> {
    let Some(blocks) = value.pointer("/message/content").and_then(Value::as_array) else {
        return Vec::new();
    };

    blocks
        .iter()
        .filter_map(|block| {
            if block.get("type").and_then(Value::as_str) != Some("tool_use")
                || block.get("name").and_then(Value::as_str) != Some("SendMessage")
            {
                return None;
            }
            let input = block.get("input")?;
            // The same tool writes to teammates and other sessions, by name. Only an agent's id
            // names something that runs in this conversation's background.
            let to = input
                .get("to")
                .and_then(Value::as_str)
                .filter(|to| is_agent_id(to))?;

            Some(TaskSignal::Running {
                task: to.to_string(),
                tool: block.get("id").and_then(Value::as_str).map(str::to_string),
                name: input
                    .get("summary")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                background: Some(true),
            })
        })
        .collect()
}

/// The signal a `<task-notification>` text stands for, if `text` is one.
fn ended(text: &str) -> Option<TaskSignal> {
    let notice = notification(text)?;

    Some(TaskSignal::Ended {
        task: notice.task.to_string(),
        tool: notice.tool.map(str::to_string),
        name: quoted(notice.summary).map(str::to_string),
    })
}

/// The id of the agent a tool result says was launched in the background, if it says so.
fn launched(text: &str) -> Option<&str> {
    if !text.contains(LAUNCH_ACK) {
        return None;
    }
    let rest = &text[text.find(LAUNCH_ID)? + LAUNCH_ID.len()..];
    let end = rest
        .find(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_')
        .unwrap_or(rest.len());

    (end > 0).then(|| &rest[..end])
}

/// Whether a `SendMessage` recipient is a background agent's id (`a` and sixteen hex digits), as
/// opposed to the name of a teammate or another session.
fn is_agent_id(to: &str) -> bool {
    to.len() == 17 && to.starts_with('a') && to[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// A tool result's text: a plain string, or the text blocks of an array joined.
fn result_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| block.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// What sits between `<name>` and `</name>` in `text`, trimmed.
fn tag<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let start = text.find(&open)? + open.len();
    let end = start + text[start..].find(&close)?;

    Some(text[start..end].trim())
}

/// What a summary puts in double quotes, which is the task's name: `Agent "Map the popup" finished`.
fn quoted(summary: &str) -> Option<&str> {
    let start = summary.find('"')? + 1;
    let end = start + summary[start..].rfind('"')?;

    (end > start).then(|| &summary[start..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn running(
        task: &str,
        tool: Option<&str>,
        name: Option<&str>,
        background: Option<bool>,
    ) -> TaskSignal {
        TaskSignal::Running {
            task: task.into(),
            tool: tool.map(str::to_string),
            name: name.map(str::to_string),
            background,
        }
    }

    fn ended_signal(task: &str, tool: Option<&str>, name: Option<&str>) -> TaskSignal {
        TaskSignal::Ended {
            task: task.into(),
            tool: tool.map(str::to_string),
            name: name.map(str::to_string),
        }
    }

    #[test]
    fn a_stream_says_when_an_agent_starts_carries_on_and_stops() {
        let started = r#"{"type":"system","subtype":"task_started","task_id":"a1","tool_use_id":"t1","description":"Map the popup","subagent_type":"Explore","is_backgrounded":true,"task_type":"local_agent"}"#;
        assert_eq!(
            task_signals(started),
            vec![running("a1", Some("t1"), Some("Map the popup"), Some(true))]
        );

        let progress = r#"{"type":"system","subtype":"task_progress","task_id":"a1","tool_use_id":"t1","description":"Map the popup","subagent_type":"Explore","usage":{"total_tokens":1,"tool_uses":2,"duration_ms":3}}"#;
        assert_eq!(
            task_signals(progress),
            vec![running("a1", Some("t1"), Some("Map the popup"), None)]
        );

        let backgrounded = r#"{"type":"system","subtype":"task_updated","task_id":"a1","patch":{"is_backgrounded":true}}"#;
        assert_eq!(
            task_signals(backgrounded),
            vec![running("a1", None, None, Some(true))]
        );

        let done = r#"{"type":"system","subtype":"task_notification","task_id":"a1","tool_use_id":"t1","status":"completed","output_file":"/tmp/a1.output","summary":"Agent \"Map the popup\" finished"}"#;
        assert_eq!(
            task_signals(done),
            vec![ended_signal("a1", Some("t1"), Some("Map the popup"))]
        );

        let killed = r#"{"type":"system","subtype":"task_updated","task_id":"a1","patch":{"status":"killed"}}"#;
        assert_eq!(task_signals(killed), vec![ended_signal("a1", None, None)]);
    }

    #[test]
    fn tasks_that_are_not_this_conversations_agents_are_left_out() {
        // A shell command running in the background is a task, but not an agent.
        let shell = r#"{"type":"system","subtype":"task_started","task_id":"b1","tool_use_id":"t1","description":"Run the build","task_type":"local_bash"}"#;
        assert!(task_signals(shell).is_empty());
        let shell_progress = r#"{"type":"system","subtype":"task_progress","task_id":"b1","description":"Run the build"}"#;
        assert!(task_signals(shell_progress).is_empty());

        // An agent started by a sub-agent is that sub-agent's.
        let nested = r#"{"type":"system","subtype":"task_started","task_id":"a2","description":"Dig","task_type":"local_agent","owned_by_subagent":"a1"}"#;
        assert!(task_signals(nested).is_empty());
        let sidechain = r#"{"type":"system","subtype":"task_started","task_id":"a2","description":"Dig","task_type":"local_agent","parent_tool_use_id":"t9"}"#;
        assert!(task_signals(sidechain).is_empty());
    }

    #[test]
    fn a_transcript_says_the_same_in_words() {
        // The launch is acknowledged at once, with the id the agent goes by from then on.
        let ack = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"Async agent launched successfully. (This tool result is internal metadata)\nagentId: a1ea0b6caa487b5c5 (internal ID - do not mention to user.)\nThe agent is working in the background."}]}]}}"#;
        assert_eq!(
            task_signals(ack),
            vec![running("a1ea0b6caa487b5c5", Some("t1"), None, Some(true))]
        );

        // A result that is the agent's answer says nothing about the background.
        let answer = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t2","content":"Here is what I found."}]}}"#;
        assert!(task_signals(answer).is_empty());

        // A message to the agent sets it going again.
        let resume = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t3","name":"SendMessage","input":{"to":"a1ea0b6caa487b5c5","summary":"Resume the mapping","message":"Please finish."}}]}}"#;
        assert_eq!(
            task_signals(resume),
            vec![running(
                "a1ea0b6caa487b5c5",
                Some("t3"),
                Some("Resume the mapping"),
                Some(true)
            )]
        );
        // A message to a teammate, by name, does not.
        let teammate = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t4","name":"SendMessage","input":{"to":"reviewer","message":"hi"}}]}}"#;
        assert!(task_signals(teammate).is_empty());

        // And Claude tells the main agent when it stops, as a user-role message.
        let stopped = r#"{"type":"user","promptSource":"system","message":{"role":"user","content":"<task-notification>\n<task-id>a1ea0b6caa487b5c5</task-id>\n<tool-use-id>t3</tool-use-id>\n<output-file>/tmp/a.output</output-file>\n<status>completed</status>\n<summary>Agent \"Map the popup\" finished</summary>\n<result>All done.</result>\n</task-notification>"}}"#;
        assert_eq!(
            task_signals(stopped),
            vec![ended_signal(
                "a1ea0b6caa487b5c5",
                Some("t3"),
                Some("Map the popup")
            )]
        );
    }

    #[test]
    fn a_notification_is_read_for_what_a_person_needs_of_it() {
        let text = "<task-notification>\n<task-id>a1</task-id>\n<status>stopped</status>\n<summary>Background agent \"Map the popup\" didn't finish before the previous session ended</summary>\n<note>long</note>\n</task-notification>";
        let notice = notification(text).expect("a notification");

        assert_eq!(notice.task, "a1");
        assert_eq!(notice.tool, None);
        assert_eq!(
            notice.summary,
            "Background agent \"Map the popup\" didn't finish before the previous session ended"
        );
        assert!(notification("just a prompt that mentions task-id").is_none());
    }
}
