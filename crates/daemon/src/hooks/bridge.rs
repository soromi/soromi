//! The `hook` bridge: when the binary is invoked as `<exe> hook <cue> <agent>` (by an agent
//! hook), it delivers the event to the running daemon over its unix socket and exits, instead of
//! starting the app/daemon.

/// A parsed `hook` invocation: the cue and the agent that fired it (e.g. `claude`).
pub struct Invocation {
    pub cue: String,
    pub agent: Option<String>,
}

/// If this process was invoked as an event bridge (`<exe> hook <cue> [agent]`), returns it.
pub fn invocation() -> Option<Invocation> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some("hook") {
        return None;
    }
    let cue = args.next()?;
    let agent = args.next();
    Some(Invocation { cue, agent })
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
