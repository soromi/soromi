//! Claude's stream-json chat vocabulary: the provider-specific bits the headless session layers on
//! top of the shared stream-json transport — the context-usage fields and the outgoing attachment
//! content blocks (Anthropic's image/document/text shape). The session calls these through
//! `Provider::context_tokens` / `Provider::attachment_block`, so it never parses Claude's fields.

use serde_json::{Value, json};
use soromi_protocol::{ChatEvent, ChatFile, Status, ToolApproval, ToolKind};

use super::transcript;
use crate::providers::{ChatFrame, Provider};

/// Parses one Claude stream-json frame into a provider-agnostic [`ChatFrame`]. The `assistant`/`user`
/// frames share the transcript shape, so the transcript parser handles them; `result` ends the turn;
/// `stream_event` carries token deltas; `control_request/can_use_tool` is a tool approval; the init
/// frame lists slash commands. Everything else is ignored (unknown frame types are safe).
pub fn parse_chat_frame(claude: &super::Claude, line: &str) -> ChatFrame {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return ChatFrame::Ignore;
    };
    match value.get("type").and_then(Value::as_str) {
        Some("assistant") | Some("user") => {
            let events = transcript::parse_line(line);
            if events.is_empty() {
                ChatFrame::Ignore
            } else {
                ChatFrame::Events(events)
            }
        }
        // The opening frame lists the available slash commands (the `/` menu's capability signal).
        Some("system") if value.get("subtype").and_then(Value::as_str) == Some("init") => {
            match value.get("slash_commands").and_then(Value::as_array) {
                Some(list) => {
                    let cwd = value
                        .get("cwd")
                        .and_then(Value::as_str)
                        .map(std::path::PathBuf::from)
                        .unwrap_or_default();
                    ChatFrame::Commands(
                        list.iter()
                            .filter_map(|v| v.as_str())
                            .map(|name| soromi_protocol::SlashCommand {
                                description: claude.describe_command(name, &cwd),
                                name: name.to_string(),
                            })
                            .collect(),
                    )
                }
                None => ChatFrame::Ignore,
            }
        }
        // Compaction ran (auto when the window filled, or from `/compact`) — surface a notice.
        Some("system")
            if value.get("subtype").and_then(Value::as_str) == Some("compact_boundary") =>
        {
            let auto = value
                .pointer("/compact_metadata/trigger")
                .and_then(Value::as_str)
                == Some("auto");
            let text = if auto {
                "Context was full - automatically compacted to free space".to_string()
            } else {
                "Conversation compacted to free up context".to_string()
            };
            ChatFrame::Events(vec![ChatEvent::Notice { text }])
        }
        // A turn finished; the agent is idle waiting for the next message.
        Some("result") => ChatFrame::Status(Status::Idle),
        // Streaming token deltas (`--include-partial-messages`): surface assistant `text_delta`.
        Some("stream_event") => {
            let delta = value.pointer("/event/delta");
            match delta.and_then(|d| d.get("type")).and_then(Value::as_str) {
                Some("text_delta") => delta
                    .and_then(|d| d.get("text"))
                    .and_then(Value::as_str)
                    .filter(|text| !text.is_empty())
                    .map(|text| ChatFrame::Delta(text.to_string()))
                    .unwrap_or(ChatFrame::Ignore),
                _ => ChatFrame::Ignore,
            }
        }
        // A tool needs approval (`--permission-prompt-tool stdio`).
        Some("control_request")
            if value.pointer("/request/subtype").and_then(Value::as_str)
                == Some("can_use_tool") =>
        {
            let request_id = value
                .get("request_id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let tool_name = value
                .pointer("/request/tool_name")
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let input = value
                .pointer("/request/input")
                .cloned()
                .unwrap_or(Value::Null);
            ChatFrame::Approval(build_approval(claude, request_id, tool_name, &input), input)
        }
        _ => ChatFrame::Ignore,
    }
}

/// Renders a `can_use_tool` request as a `ToolApproval` by reusing the transcript parser: a
/// `tool_use` block has the same shape, so we get the same name / path / body / kind a tool card shows.
fn build_approval(
    claude: &super::Claude,
    request_id: &str,
    tool_name: &str,
    input: &Value,
) -> ToolApproval {
    let synthetic = json!({
        "type": "assistant",
        "message": { "role": "assistant", "content": [
            { "type": "tool_use", "id": request_id, "name": tool_name, "input": input },
        ]},
    })
    .to_string();
    let (path, body, kind) = transcript::parse_line(&synthetic)
        .into_iter()
        .find_map(|event| match event {
            ChatEvent::Tool {
                path,
                body,
                tool_kind,
                ..
            } => Some((path, body, tool_kind)),
            _ => None,
        })
        .unwrap_or((None, None, ToolKind::Other));
    // A plan approval must show the whole plan, not the transcript card's truncated summary.
    let body = claude.plan_approval_body(tool_name, input).or(body);
    ToolApproval {
        id: request_id.to_string(),
        name: tool_name.to_string(),
        path,
        body,
        kind,
    }
}

/// The current context size from one Claude stream-json frame: `Some(Some(n))` an `assistant` frame's
/// prompt + cached tokens; `Some(None)` a `compact_boundary` that freed the window (reset until the
/// next turn reports the new size); `None` the frame carries nothing for the meter.
pub fn context_tokens(line: &str) -> Option<Option<u32>> {
    let value: Value = serde_json::from_str(line).ok()?;
    match value.get("type").and_then(Value::as_str) {
        Some("assistant") => {
            let usage = value.pointer("/message/usage")?;
            let field = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
            let total = field("input_tokens")
                + field("cache_read_input_tokens")
                + field("cache_creation_input_tokens");
            (total > 0).then_some(Some(total as u32))
        }
        Some("system")
            if value.get("subtype").and_then(Value::as_str) == Some("compact_boundary") =>
        {
            Some(None)
        }
        _ => None,
    }
}

/// One attached file as a Claude content block: images and PDFs carry their base64 directly; a text
/// file is decoded and inlined (labelled with its name); anything else falls back to a note.
pub fn attachment_block(file: &ChatFile) -> Value {
    if file.media_type.starts_with("image/") {
        return json!({
            "type": "image",
            "source": { "type": "base64", "media_type": file.media_type, "data": file.data },
        });
    }
    if file.media_type == "application/pdf" {
        return json!({
            "type": "document",
            "source": { "type": "base64", "media_type": "application/pdf", "data": file.data },
        });
    }
    // Text (or unknown): try to decode the base64 and inline it as text.
    let name = file.filename.clone().unwrap_or_else(|| "file".to_string());
    let text = base64_text(&file.data)
        .map(|body| format!("[File: {name}]\n{body}"))
        .unwrap_or_else(|| format!("[Attached {name} ({})]", file.media_type));
    json!({ "type": "text", "text": text })
}

/// Decodes standard base64 (the data-URL payload) to UTF-8 text, or `None` if it isn't valid text.
fn base64_text(data: &str) -> Option<String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .ok()?;
    String::from_utf8(bytes).ok()
}
