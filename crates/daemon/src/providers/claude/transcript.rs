//! Claude's transcript format: parses one JSONL line Claude writes as it works (one JSON object per
//! line) into structured chat events. The generic tailer (`transcript::tailer`) follows the file
//! and calls this via `Provider::parse_transcript_line`, streaming events so a viewport can render
//! a reflowing chat and the sidebar can show per-tab activity and sub-agents.

use serde_json::Value;
use soromi_protocol::{ChatEvent, ChatFile, ToolKind};

/// Long tool bodies and results are clipped so a single transcript line can't flood the wire.
const MAX_BODY: usize = 4000;

/// The `uuid` of the entry on a transcript line. Entries that are part of the conversation have one;
/// bookkeeping lines (mode changes, queue operations) do not.
pub fn entry_id(line: &str) -> Option<&str> {
    /// Just the id: the rest of the line (which can be megabytes of tool output) is skipped over
    /// without being built.
    #[derive(serde::Deserialize)]
    struct Entry<'a> {
        #[serde(borrow)]
        uuid: Option<&'a str>,
    }
    serde_json::from_str::<Entry>(line).ok()?.uuid
}

/// Parses one transcript line into zero or more chat events. Metadata lines (mode changes,
/// snapshots, attachments) yield nothing; an assistant line yields one event per content block.
pub fn parse_line(line: &str) -> Vec<ChatEvent> {
    serde_json::from_str::<Value>(line)
        .ok()
        .map(|value| parse_value(&value))
        .unwrap_or_default()
}

fn parse_value(value: &Value) -> Vec<ChatEvent> {
    // A sub-agent's (Task/Agent) own conversation is interleaved into the stream/transcript, tagged
    // `isSidechain: true` (transcript) or with a non-null `parent_tool_use_id` (stream). Those belong
    // to the sub-agent, not the main thread — skip them so they don't render as chat bubbles. The
    // sub-agent still surfaces via the main thread's `Agent` tool call (and the agents-working panel).
    if value.get("isSidechain").and_then(Value::as_bool) == Some(true)
        || value
            .get("parent_tool_use_id")
            .is_some_and(|id| !id.is_null())
    {
        return Vec::new();
    }
    // Internal bookkeeping messages, not conversation: the `<local-command-caveat>` (`isMeta`) and the
    // post-compaction continuation summary (`isVisibleInTranscriptOnly` / `isCompactSummary`). They'd
    // otherwise render as giant/odd bubbles, so drop them.
    if value.get("isMeta").and_then(Value::as_bool) == Some(true)
        || value
            .get("isVisibleInTranscriptOnly")
            .and_then(Value::as_bool)
            == Some(true)
        || value.get("isCompactSummary").and_then(Value::as_bool) == Some(true)
    {
        return Vec::new();
    }
    match value.get("type").and_then(Value::as_str) {
        Some("user") => parse_user(value),
        Some("assistant") => parse_assistant(value),
        // The conversation was compacted here: mark the spot.
        Some("system")
            if value.get("subtype").and_then(Value::as_str) == Some("compact_boundary") =>
        {
            let auto = value
                .pointer("/compactMetadata/trigger")
                .and_then(Value::as_str)
                == Some("auto");
            vec![compaction_notice(auto)]
        }
        _ => Vec::new(),
    }
}

/// The marker shown where a conversation was compacted, whether the user asked for it or the
/// context filled up. The chat keeps showing what came before, which the agent itself no longer
/// has in full (and which its own terminal view no longer shows), so the marker says so: without
/// it the chat and the agent appear to disagree about the conversation.
pub(super) fn compaction_notice(auto: bool) -> ChatEvent {
    let text = if auto {
        "Context full, compacted automatically: the agent now works from a summary of the conversation above"
    } else {
        "Compacted: the agent now works from a summary of the conversation above"
    };
    ChatEvent::Notice {
        text: text.to_string(),
    }
}

fn parse_user(value: &Value) -> Vec<ChatEvent> {
    let Some(content) = value.pointer("/message/content") else {
        return Vec::new();
    };

    // A stop is recorded as a `user` message carrying `interruptedMessageId` (a field a real prompt
    // never has) — surface it as a system notice, not a user bubble. Detected by the field, not by
    // matching the wording.
    if value.get("interruptedMessageId").is_some() {
        let text = content
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| result_text(Some(content)));
        return vec![ChatEvent::Notice { text }];
    }

    // A plain prompt is a string; tool results / a prompt-with-attachments come as an array of blocks.
    if let Some(text) = content.as_str() {
        return user_text(text).into_iter().collect();
    }

    let Some(blocks) = content.as_array() else {
        return Vec::new();
    };

    // Tool-result messages map block-by-block; a prompt (text + image/document blocks) folds into one
    // `User` event carrying its attachments, so the bubble can show inline thumbnails.
    let mut events = Vec::new();
    let mut text = String::new();
    let mut files = Vec::new();
    for block in blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("tool_result") => {
                let raw = result_text(block.get("content"));
                // The `Skill` tool's result is the entire SKILL.md; the card already shows it ran.
                if is_skill_dump(&raw) {
                    continue;
                }
                let id = str_field(block, "tool_use_id");
                let ok = !block
                    .get("is_error")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let result = truncate(&raw, MAX_BODY);
                events.push(ChatEvent::ToolResult {
                    id,
                    ok,
                    text: result,
                });
            }
            Some("text") => {
                if let Some(chunk) = block.get("text").and_then(Value::as_str) {
                    if is_skill_dump(chunk) {
                        continue;
                    }
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(chunk);
                }
            }
            Some("image") | Some("document") => {
                if let Some(file) = file_from_block(block) {
                    files.push(file);
                }
            }
            _ => {}
        }
    }
    // Emit the prompt (if any) ahead of tool results; a message is one or the other, so they don't mix.
    let trimmed = text.trim();
    // The note that a background task stopped can come as a text block too (see `user_text`).
    if files.is_empty()
        && let Some(notice) = super::tasks::notification(trimmed)
    {
        if !notice.summary.is_empty() {
            events.insert(
                0,
                ChatEvent::Notice {
                    text: notice.summary.to_string(),
                },
            );
        }
        return events;
    }
    if !trimmed.is_empty() || !files.is_empty() {
        events.insert(
            0,
            ChatEvent::User {
                text: trimmed.to_string(),
                files,
            },
        );
    }
    events
}

/// A base64 image/document content block as a `ChatFile` (for inline attachment thumbnails).
fn file_from_block(block: &Value) -> Option<ChatFile> {
    let source = block.get("source")?;
    if source.get("type").and_then(Value::as_str) != Some("base64") {
        return None;
    }
    Some(ChatFile {
        media_type: source
            .get("media_type")
            .and_then(Value::as_str)?
            .to_string(),
        data: source.get("data").and_then(Value::as_str)?.to_string(),
        filename: None,
        deferred: false,
    })
}

fn user_text(text: &str) -> Option<ChatEvent> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    // Claude logs slash commands and their output as "user" messages. They aren't things the user
    // typed, so surface them as subtle system notices (not user bubbles), and drop the internal
    // caveat entirely.
    if let Some(command) = command_invocation(text) {
        // A compaction is marked where it took effect (see `compaction_notice`); the command that
        // asked for it, logged after the fact, would only repeat that out of place.
        if command == "/compact" || command.starts_with("/compact ") {
            return None;
        }
        return Some(ChatEvent::Notice { text: command });
    }
    if let Some(stdout) = tag_inner(text, "local-command-stdout") {
        let clean = strip_ansi(stdout).trim().to_string();
        // Likewise the command's one-word report that it finished.
        if clean == "Compacted" {
            return None;
        }
        return (!clean.is_empty()).then_some(ChatEvent::Notice { text: clean });
    }
    // Claude tells the main agent that a background task stopped in a user-role message. Nobody
    // typed it: show the one line a person needs of it, as a system notice.
    if let Some(notice) = super::tasks::notification(text) {
        return (!notice.summary.is_empty()).then(|| ChatEvent::Notice {
            text: notice.summary.to_string(),
        });
    }
    // The local-command caveat, tagged (`<local-command-caveat>…`) or bare — internal, never a prompt.
    if text.starts_with("Caveat: The messages below were generated by the user")
        || text.starts_with("<local-command-caveat>")
    {
        return None;
    }
    // Running a skill injects its whole SKILL.md as a "user" message (`Base directory for this
    // skill: …`). That's agent context, not something the user typed - the `Skill` tool card already
    // marks that the skill ran, so drop the dump instead of rendering it as a giant chat bubble.
    if is_skill_dump(text) {
        return None;
    }
    Some(ChatEvent::User {
        text: text.to_string(),
        files: Vec::new(),
    })
}

/// A skill invocation injects its whole SKILL.md (`Base directory for this skill: …`) — as an
/// injected user string, a `text` block, or (most often) the `Skill` tool's own result. The Skill
/// tool card already marks that it ran, so this dump is never echoed as a bubble or a result block.
fn is_skill_dump(text: &str) -> bool {
    text.trim_start()
        .starts_with("Base directory for this skill:")
}

/// The inner text of the first `<tag>…</tag>` in `text`, if present.
fn tag_inner<'a>(text: &'a str, tag: &str) -> Option<&'a str> {
    let start = text.find(&format!("<{tag}>"))? + tag.len() + 2;
    let end = text[start..].find(&format!("</{tag}>"))? + start;
    Some(&text[start..end])
}

/// Renders a logged slash-command message (`<command-name>/model</command-name>` plus optional
/// `<command-args>`) as its invocation, e.g. `/model opus`. `None` if it isn't a command message.
fn command_invocation(text: &str) -> Option<String> {
    let name = tag_inner(text, "command-name")?
        .trim()
        .trim_start_matches('/');
    if name.is_empty() {
        return None;
    }
    let args = tag_inner(text, "command-args").unwrap_or("").trim();
    Some(if args.is_empty() {
        format!("/{name}")
    } else {
        format!("/{name} {args}")
    })
}

/// Strips ANSI CSI escape sequences (`ESC [ … <final>`), so command output like the bold markers in
/// `/model`'s reply doesn't leak `[1m` / `[22m` into the chat.
fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            for c in chars.by_ref() {
                if ('@'..='~').contains(&c) {
                    break;
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

fn parse_assistant(value: &Value) -> Vec<ChatEvent> {
    value
        .pointer("/message/content")
        .and_then(Value::as_array)
        .map(|blocks| blocks.iter().filter_map(parse_assistant_block).collect())
        .unwrap_or_default()
}

fn parse_assistant_block(block: &Value) -> Option<ChatEvent> {
    match block.get("type").and_then(Value::as_str) {
        Some("text") => non_empty(block.get("text"))
            .filter(|t| !is_signature_blob(t))
            .map(|text| ChatEvent::Assistant { text }),
        // A thinking block carries readable reasoning in `thinking`; its `signature` (an encrypted
        // base64 blob) is separate and never surfaced. Headless mode sometimes delivers an empty
        // `thinking` with only a signature - filter both so the signature can't leak as a bubble.
        Some("thinking") => non_empty(block.get("thinking"))
            .filter(|t| !is_signature_blob(t))
            .map(|text| ChatEvent::Thinking { text }),
        Some("tool_use") => Some(parse_tool_use(block)),
        _ => None,
    }
}

/// Whether a string is one long base64 token with no whitespace — i.e. a thinking-block signature,
/// not prose. Reasoning and assistant text always have spaces/punctuation, so this only trips on the
/// encrypted signature blob that must never render.
fn is_signature_blob(text: &str) -> bool {
    let text = text.trim();
    text.len() >= 80
        && !text.contains(char::is_whitespace)
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '='))
}

fn parse_tool_use(block: &Value) -> ChatEvent {
    let name = block
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let input = block.get("input").cloned().unwrap_or(Value::Null);
    let path = input
        .get("file_path")
        .and_then(Value::as_str)
        .map(str::to_string);

    ChatEvent::Tool {
        id: str_field(block, "id"),
        body: tool_body(&name, &input),
        tool_kind: tool_kind(&name),
        name,
        path,
    }
}

/// Maps a Claude tool name to its provider-agnostic [`ToolKind`]. This is the *only* place Claude's
/// tool names are classified; everything downstream (icons, activity verbs, is-edit / is-sub-agent /
/// is-plan) reads the kind, so another provider just implements its own mapping.
fn tool_kind(name: &str) -> ToolKind {
    match name {
        "Edit" | "MultiEdit" | "NotebookEdit" | "Update" => ToolKind::Edit,
        "Write" => ToolKind::Write,
        "Bash" => ToolKind::Run,
        "Read" => ToolKind::Read,
        "Grep" | "Glob" => ToolKind::Search,
        // Named `Task` historically, renamed to `Agent` in Claude Code 2.1 — accept both.
        "Task" | "Agent" => ToolKind::Agent,
        "Skill" => ToolKind::Skill,
        "ExitPlanMode" => ToolKind::Plan,
        _ => ToolKind::Other,
    }
}

/// A renderable one-glance summary of a tool call: the command for `Bash`, a diff for `Edit`, the
/// written content for `Write`, the query for searches, else compact JSON.
fn tool_body(name: &str, input: &Value) -> Option<String> {
    let text = match name {
        "Bash" => str_input(input, "command"),
        "Edit" | "MultiEdit" => diff_body(input),
        "Write" => str_input(input, "content"),
        "Read" => str_input(input, "file_path"),
        "Grep" | "Glob" => str_input(input, "pattern"),
        // A spawned sub-agent: its short task description is the label the sidebar shows (e.g.
        // "Map v1 -> v2 fields"), falling back to the sub-agent type when there's no description.
        // Named `Task` historically, renamed to `Agent` in Claude Code 2.1 — accept both.
        "Task" | "Agent" => {
            str_input(input, "description").or_else(|| str_input(input, "subagent_type"))
        }
        // A skill invocation: show the skill name (`expo:expo-router`), not the raw input JSON. Its
        // loaded instructions are injected separately and dropped from the chat (see `user_text`).
        "Skill" => str_input(input, "skill"),
        // Exiting plan mode: the proposed plan (markdown), not the raw input JSON.
        "ExitPlanMode" => str_input(input, "plan"),
        _ => Some(serde_json::to_string(input).unwrap_or_default()),
    };

    text.map(|body| truncate(&body, MAX_BODY))
        .filter(|body| !body.is_empty())
}

fn diff_body(input: &Value) -> Option<String> {
    let old = input
        .get("old_string")
        .and_then(Value::as_str)
        .unwrap_or("");
    let new = input
        .get("new_string")
        .and_then(Value::as_str)
        .unwrap_or("");
    if old.is_empty() && new.is_empty() {
        return None;
    }

    let mut diff = String::new();
    for line in old.lines() {
        diff.push_str("- ");
        diff.push_str(line);
        diff.push('\n');
    }
    for line in new.lines() {
        diff.push_str("+ ");
        diff.push_str(line);
        diff.push('\n');
    }

    Some(diff)
}

/// A tool result's content is a string, or an array of text blocks; join the text.
fn result_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|block| block.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn str_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn str_input(input: &Value, key: &str) -> Option<String> {
    input.get(key).and_then(Value::as_str).map(str::to_string)
}

fn non_empty(value: Option<&Value>) -> Option<String> {
    let text = value.and_then(Value::as_str).unwrap_or("").trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// Clips to `max` bytes on a char boundary, trailing an ellipsis.
fn truncate(text: &str, max: usize) -> String {
    let text = text.trim_end();
    if text.len() <= max {
        return text.to_string();
    }

    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &text[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_metadata_line_yields_nothing() {
        assert!(parse_line(r#"{"type":"mode","mode":"default","sessionId":"s"}"#).is_empty());
        assert!(parse_line(r#"{"type":"file-history-snapshot"}"#).is_empty());
        assert!(parse_line("not json").is_empty());
    }

    #[test]
    fn a_string_user_message_is_a_prompt() {
        let events = parse_line(r#"{"type":"user","message":{"role":"user","content":"hello"}}"#);
        assert_eq!(
            events,
            vec![ChatEvent::User {
                text: "hello".into(),
                files: Vec::new(),
            }]
        );
    }

    #[test]
    fn local_command_artifacts_become_notices_not_user_bubbles() {
        // The internal caveat is dropped entirely.
        assert!(parse_line(
            r#"{"type":"user","message":{"role":"user","content":"Caveat: The messages below were generated by the user while running local commands. DO NOT respond."}}"#
        )
        .is_empty());

        // A slash-command invocation reads as its command, as a notice.
        assert_eq!(
            parse_line(
                r#"{"type":"user","message":{"role":"user","content":"<command-name>/model</command-name>\n<command-args>opus</command-args>"}}"#
            ),
            vec![ChatEvent::Notice {
                text: "/model opus".into()
            }]
        );

        // Command output is shown as a notice, not a user bubble.
        assert_eq!(
            parse_line(
                r#"{"type":"user","message":{"role":"user","content":"<local-command-stdout>Set model to Opus 5</local-command-stdout>"}}"#
            ),
            vec![ChatEvent::Notice {
                text: "Set model to Opus 5".into()
            }]
        );
    }

    #[test]
    fn sub_agent_sidechain_messages_are_skipped() {
        // Transcript marker.
        assert!(parse_line(
            r#"{"type":"assistant","isSidechain":true,"message":{"role":"assistant","content":[{"type":"text","text":"inner"}]}}"#
        )
        .is_empty());
        // Stream marker (a non-null parent_tool_use_id).
        assert!(parse_line(
            r#"{"type":"user","parent_tool_use_id":"toolu_1","message":{"role":"user","content":"the sub-agent prompt"}}"#
        )
        .is_empty());
        // A normal message (parent_tool_use_id null) still parses.
        assert_eq!(
            parse_line(
                r#"{"type":"user","parent_tool_use_id":null,"message":{"role":"user","content":"hi"}}"#
            ),
            vec![ChatEvent::User {
                text: "hi".into(),
                files: Vec::new()
            }]
        );
    }

    #[test]
    fn strip_ansi_removes_escape_sequences() {
        assert_eq!(
            strip_ansi("Set model to \u{1b}[1mOpus 5\u{1b}[22m"),
            "Set model to Opus 5"
        );
    }

    #[test]
    fn assistant_text_and_thinking_blocks_split() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[
            {"type":"thinking","thinking":"hmm"},
            {"type":"text","text":"Done."}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![
                ChatEvent::Thinking { text: "hmm".into() },
                ChatEvent::Assistant {
                    text: "Done.".into()
                },
            ]
        );
    }

    #[test]
    fn a_bash_tool_use_carries_the_command() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[
            {"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls -a"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![ChatEvent::Tool {
                id: "t1".into(),
                name: "Bash".into(),
                path: None,
                body: Some("ls -a".into()),
                tool_kind: ToolKind::Run,
            }]
        );
    }

    #[test]
    fn an_edit_tool_use_carries_a_diff_and_path() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[
            {"type":"tool_use","id":"t2","name":"Edit","input":{"file_path":"a.ts","old_string":"one","new_string":"two"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![ChatEvent::Tool {
                id: "t2".into(),
                name: "Edit".into(),
                path: Some("a.ts".into()),
                body: Some("- one\n+ two".into()),
                tool_kind: ToolKind::Edit,
            }]
        );
    }

    #[test]
    fn a_skill_tool_use_carries_the_skill_name_not_raw_json() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[
            {"type":"tool_use","id":"t3","name":"Skill","input":{"skill":"expo:expo-router"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![ChatEvent::Tool {
                id: "t3".into(),
                name: "Skill".into(),
                path: None,
                body: Some("expo:expo-router".into()),
                tool_kind: ToolKind::Skill,
            }]
        );
    }

    #[test]
    fn an_exit_plan_mode_tool_use_carries_the_plan_not_raw_json() {
        let line = r##"{"type":"assistant","message":{"role":"assistant","content":[
            {"type":"tool_use","id":"t4","name":"ExitPlanMode","input":{"plan":"# Plan\n\nStep one."}}
        ]}}"##;
        assert_eq!(
            parse_line(line),
            vec![ChatEvent::Tool {
                id: "t4".into(),
                name: "ExitPlanMode".into(),
                path: None,
                body: Some("# Plan\n\nStep one.".into()),
                tool_kind: ToolKind::Plan,
            }]
        );
    }

    #[test]
    fn the_local_command_caveat_is_dropped_tagged_or_meta() {
        // Tagged (live stream, no `isMeta`).
        let tagged = r#"{"type":"user","message":{"role":"user","content":"<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>"}}"#;
        assert_eq!(parse_line(tagged), vec![]);
        // Flagged `isMeta` (from the transcript / seed).
        let meta =
            r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"anything"}}"#;
        assert_eq!(parse_line(meta), vec![]);
    }

    #[test]
    fn a_compaction_is_marked_once_where_it_took_effect() {
        let marker = |auto| vec![compaction_notice(auto)];
        // What Claude writes around a compaction, in the order it writes it.
        let boundary = |trigger: &str| {
            format!(
                r#"{{"type":"system","subtype":"compact_boundary","content":"Conversation compacted","compactMetadata":{{"trigger":"{trigger}","preTokens":818185}},"uuid":"b1"}}"#
            )
        };
        assert_eq!(parse_line(&boundary("manual")), marker(false));
        assert_eq!(parse_line(&boundary("auto")), marker(true));
        assert_ne!(marker(false), marker(true));

        // The command that asked for it and its report are not shown as well.
        let command = r#"{"type":"user","message":{"role":"user","content":"<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>"}}"#;
        let with_args = r#"{"type":"user","message":{"role":"user","content":"<command-name>/compact</command-name>\n<command-args>keep the plan</command-args>"}}"#;
        let report = r#"{"type":"user","message":{"role":"user","content":"<local-command-stdout>Compacted </local-command-stdout>"}}"#;
        assert!(parse_line(command).is_empty());
        assert!(parse_line(with_args).is_empty());
        assert!(parse_line(report).is_empty());

        // Another command whose name merely starts the same way is still shown.
        let other = r#"{"type":"user","message":{"role":"user","content":"<command-name>/compactness</command-name>"}}"#;
        assert_eq!(
            parse_line(other),
            vec![ChatEvent::Notice {
                text: "/compactness".into()
            }]
        );
    }

    #[test]
    fn the_compact_continuation_summary_is_dropped() {
        let line = r#"{"type":"user","isVisibleInTranscriptOnly":true,"isCompactSummary":true,"message":{"role":"user","content":"This session is being continued from a previous conversation…"}}"#;
        assert_eq!(parse_line(line), vec![]);
    }

    #[test]
    fn a_thinking_signature_blob_never_renders() {
        // Headless delivers a thinking block whose readable text is empty and only a base64 signature
        // remains; it must not leak as a reasoning bubble.
        let sig = "CAISoQMKpgEIERgCKkDidgDGOgnevV32vsU1u85WJ1UvStmBimLUeIpBV4cGzNTw5neKYjJE3i6YmPBxcyY5LiAtkW";
        let line = format!(
            r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"thinking","thinking":"{sig}","signature":"{sig}"}}]}}}}"#
        );
        assert_eq!(parse_line(&line), vec![]);
    }

    #[test]
    fn an_injected_skill_body_is_dropped_from_the_chat() {
        let line = r#"{"type":"user","message":{"role":"user","content":"Base directory for this skill: /x/y\n\n# Expo Router Navigation\n\nNavigation and routing."}}"#;
        assert_eq!(parse_line(line), vec![]);
    }

    #[test]
    fn a_skill_tool_result_dump_is_dropped() {
        // The `Skill` tool returns its whole SKILL.md as the result — the card already marks it ran.
        let line = r#"{"type":"user","message":{"role":"user","content":[
            {"type":"tool_result","tool_use_id":"t1","content":"Base directory for this skill: /x/y\n\n# Implement a Figma Design as Code\n\nUse this skill…","is_error":false}
        ]}}"#;
        assert_eq!(parse_line(line), vec![]);
    }

    #[test]
    fn a_tool_result_ties_back_by_id() {
        let line = r#"{"type":"user","message":{"role":"user","content":[
            {"type":"tool_result","tool_use_id":"t1","content":"file listing","is_error":false}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![ChatEvent::ToolResult {
                id: "t1".into(),
                ok: true,
                text: "file listing".into(),
            }]
        );
    }

    #[test]
    fn an_errored_tool_result_is_not_ok() {
        let line = r#"{"type":"user","message":{"role":"user","content":[
            {"type":"tool_result","tool_use_id":"t9","content":"boom","is_error":true}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![ChatEvent::ToolResult {
                id: "t9".into(),
                ok: false,
                text: "boom".into(),
            }]
        );
    }
}
