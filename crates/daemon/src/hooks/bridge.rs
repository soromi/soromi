//! The `hook` bridge: when the binary is invoked as `<exe> hook <cue> <agent>` (by an agent
//! hook), it delivers the event to the running daemon over its unix socket and exits, instead of
//! starting the app/daemon.

/// A parsed `hook` invocation: the cue and the agent that fired it (e.g. `claude`).
pub struct Invocation {
    pub cue: String,
    pub agent: Option<String>,
    /// The agent's own conversation id, on a `session-start` hook (read from stdin JSON).
    pub resume_id: Option<String>,
    /// The agent's JSONL transcript path, on a `session-start` hook (read from stdin JSON), so the
    /// daemon can tail it for the chat view.
    pub transcript_path: Option<String>,
}

/// If this process was invoked as an event bridge, returns the parsed invocation:
/// - `<exe> hook <cue> [agent]`  (Claude hooks; we pass the cue directly as an arg)
/// - `<exe> codex-notify <json>` (Codex `notify`; the payload `type` -> cue)
/// - `<exe> codex-hook`          (Codex hooks; JSON on stdin, `hook_event_name` -> cue)
///
/// The `session-start` cue is special: its hook passes JSON on stdin whose `session_id` is the
/// agent's own conversation id, captured so the tab can be resumed later.
pub fn invocation() -> Option<Invocation> {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("hook") => {
            let mut cue = args.next()?;
            let agent = args.next();
            // The session-start hook's stdin JSON carries the agent's conversation id (to resume)
            // and its transcript path (to tail for chat). Read stdin once and take both.
            let (resume_id, transcript_path) = if cue == "session-start" {
                let payload = read_stdin_json();
                let field = |key: &str| {
                    payload
                        .as_ref()
                        .and_then(|value| value.get(key)?.as_str().map(str::to_string))
                };
                (field("session_id"), field("transcript_path"))
            } else if cue == "notify" {
                // Claude fires one Notification hook for two very different things: a prompt that
                // needs the user (permission / input), and a "waiting for your input" nudge once the
                // agent has simply gone idle. Read the message to tell them apart, so idle reads as
                // idle (quiet, gray) instead of demanding attention.
                cue = notify_cue(read_stdin_json());
                (None, None)
            } else {
                (None, None)
            };
            Some(Invocation {
                cue,
                agent,
                resume_id,
                transcript_path,
            })
        }
        Some("codex-notify") => {
            let payload: serde_json::Value = serde_json::from_str(&args.next()?).ok()?;
            let mut inv = codex_cue(payload.get("type")?.as_str()?)?;
            inv.resume_id = codex_session_id(&payload);
            Some(inv)
        }
        Some("codex-hook") => {
            let payload = read_stdin_json()?;
            let mut inv = codex_cue(payload.get("hook_event_name")?.as_str()?)?;
            inv.resume_id = codex_session_id(&payload);
            Some(inv)
        }
        _ => None,
    }
}

/// Resolves a Claude `Notification` into a cue from its message: the idle "waiting for your input"
/// nudge becomes `idle` (the tab goes quiet), while anything else — a permission or input prompt —
/// becomes `request` (the tab wants you). Defaults to `request` so an unrecognized prompt is surfaced
/// rather than silenced.
fn notify_cue(payload: Option<serde_json::Value>) -> String {
    let message = payload
        .as_ref()
        .and_then(|value| value.get("message"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_lowercase();
    if message.contains("waiting for your input") {
        "idle".to_string()
    } else {
        "request".to_string()
    }
}

/// Reads and parses the JSON an agent hook passes on stdin.
fn read_stdin_json() -> Option<serde_json::Value> {
    use std::io::Read;
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).ok()?;
    serde_json::from_str(input.trim()).ok()
}

/// Extracts Codex's session/conversation id from an event payload, so the tab can resume it.
/// Best-effort: Codex's exact field name is unverified, so it tries the likely keys and skips a
/// turn-scoped id (not a resume target). If none match, the tab simply starts fresh next time.
fn codex_session_id(payload: &serde_json::Value) -> Option<String> {
    for key in ["session_id", "thread_id", "conversation_id", "rollout_id"] {
        if let Some(id) = payload.get(key).and_then(serde_json::Value::as_str) {
            return Some(id.to_string());
        }
    }
    None
}

/// Maps a Codex event name (from `notify` payload `type` or a hook's `hook_event_name`) to a cue.
fn codex_cue(event: &str) -> Option<Invocation> {
    let cue = match event {
        "agent-turn-complete" | "Stop" => "complete",
        "approval-requested" | "PermissionRequest" => "request",
        _ => return None,
    };
    Some(Invocation {
        cue: cue.to_string(),
        agent: Some("codex".to_string()),
        resume_id: None,
        transcript_path: None,
    })
}

/// Delivers an invocation (plus this session's id from `SOROMI_SESSION`) to the daemon over its
/// socket. Best-effort and silent: a missing daemon must never break the agent's hook.
#[cfg(unix)]
pub fn deliver(invocation: &Invocation) {
    use std::io::Write;
    use std::os::unix::net::UnixStream;

    let session = std::env::var("SOROMI_SESSION").unwrap_or_default();
    if let Ok(mut stream) = UnixStream::connect(super::socket_path()) {
        let line = serde_json::json!({
            "cue": invocation.cue,
            "session": session,
            "agent": invocation.agent,
            "resume_id": invocation.resume_id,
            "transcript_path": invocation.transcript_path,
        })
        .to_string();
        let _ = writeln!(stream, "{line}");
    }
}

#[cfg(not(unix))]
pub fn deliver(_invocation: &Invocation) {}
