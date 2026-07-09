use std::sync::Arc;

use crate::workspaces::service::WorkspaceService;

/// Listens on the daemon's unix socket for agent-event lines from the `hook` bridge and hands
/// each to the service (which resolves the session's workspace, checks mute, plays the cue).
/// Must run within a tokio runtime.
#[cfg(unix)]
pub fn spawn(service: Arc<WorkspaceService>) {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::net::UnixListener;

    let path = super::socket_path();
    // Clear a stale socket from a previous run so bind succeeds.
    let _ = std::fs::remove_file(&path);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    tokio::spawn(async move {
        let Ok(listener) = UnixListener::bind(&path) else {
            return;
        };
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                continue;
            };
            let service = service.clone();
            tokio::spawn(async move {
                let mut line = String::new();
                let mut reader = BufReader::new(stream);
                if reader.read_line(&mut line).await.unwrap_or(0) == 0 {
                    return;
                }
                if let Ok(event) = serde_json::from_str::<super::Event>(line.trim()) {
                    if let Some(resume_id) = event.resume_id {
                        service.set_resume_id(&event.session, resume_id);
                    } else if let Some(cue) = super::cue_from(&event.cue) {
                        service.handle_agent_event(&event.session, cue, event.agent.as_deref());
                    }
                }
            });
        }
    });
}

#[cfg(not(unix))]
pub fn spawn(_service: Arc<WorkspaceService>) {}
