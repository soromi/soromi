//! The `hook` bridge: when the binary is invoked as `<exe> hook <cue> <agent>` (by an agent
//! hook), it delivers the event to the running daemon over its unix socket and exits, instead of
//! starting the app/daemon.

/// A parsed `hook` invocation: the cue and the agent that fired it (e.g. `claude`).
pub struct Invocation {
    pub cue: String,
    pub agent: Option<String>,
}

/// If this process was invoked as an event bridge, returns the parsed invocation:
/// - `<exe> hook <cue> [agent]`  (Claude hooks; we pass the cue directly as an arg)
/// - `<exe> codex-notify <json>` (Codex `notify`; the payload `type` -> cue)
/// - `<exe> codex-hook`          (Codex hooks; JSON on stdin, `hook_event_name` -> cue)
pub fn invocation() -> Option<Invocation> {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("hook") => {
            let cue = args.next()?;
            let agent = args.next();
            Some(Invocation { cue, agent })
        }
        Some("codex-notify") => {
            let payload: serde_json::Value = serde_json::from_str(&args.next()?).ok()?;
            codex_cue(payload.get("type")?.as_str()?)
        }
        Some("codex-hook") => {
            use std::io::Read;
            let mut input = String::new();
            std::io::stdin().read_to_string(&mut input).ok()?;
            let payload: serde_json::Value = serde_json::from_str(input.trim()).ok()?;
            codex_cue(payload.get("hook_event_name")?.as_str()?)
        }
        _ => None,
    }
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
        })
        .to_string();
        let _ = writeln!(stream, "{line}");
    }
}

#[cfg(not(unix))]
pub fn deliver(_invocation: &Invocation) {}
