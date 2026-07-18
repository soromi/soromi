use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

use soromi_protocol::ServerMessage;

use super::codec::Codec;
use super::connection::{Connection, send_state};
use crate::accounts::store::FileAccountManager;
use crate::pairing::PairingService;
use crate::workspaces::service::WorkspaceService;

/// Called with a relay link's live peer presence (`true` once the phone attaches, `false` when it
/// drops). Set only for relay device links; local links pass `None`.
pub(crate) type PresenceSink = Arc<dyn Fn(bool) + Send + Sync>;

/// How often the connection sends a keepalive ping. Shorter than the relay's heartbeat, so an idle
/// link stays alive and any queued pong is flushed before the relay would drop it.
const KEEPALIVE: std::time::Duration = std::time::Duration::from_secs(20);

/// Hands each connection a distinct viewer id, so terminal control (input / size) can be pinned to
/// one viewport at a time.
static NEXT_VIEWER: AtomicU64 = AtomicU64::new(1);

/// This machine's display name, shown to remote devices when the desktop is in control. On macOS
/// it is the friendly Computer Name (System Settings > Sharing); otherwise the hostname. Falls back
/// to a generic label.
fn local_device_name() -> String {
    #[cfg(target_os = "macos")]
    if let Some(name) = command_output("scutil", &["--get", "ComputerName"]) {
        return name;
    }

    command_output("hostname", &[])
        .map(|host| host.trim_end_matches(".local").to_string())
        .filter(|host| !host.is_empty())
        .unwrap_or_else(|| "This computer".to_string())
}

/// Runs a command and returns its trimmed stdout, or `None` if it failed or produced nothing.
fn command_output(command: &str, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new(command).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8(output.stdout).ok()?;
    let trimmed = text.trim();

    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Accepts local viewport connections forever. Each connection runs independently and, being
/// local (trusted), carries the pairing service so the desktop can manage devices.
pub async fn serve(
    listener: TcpListener,
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    pairing: Arc<PairingService>,
) {
    // Resolved once: the machine's name, shown to remote devices when this computer is in control.
    let device_name = local_device_name();
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            continue;
        };
        let hub = hub.clone();
        let accounts = accounts.clone();
        let pairing = pairing.clone();
        let name = device_name.clone();
        tokio::spawn(async move {
            if let Ok(ws) = accept_async(stream).await {
                // Local links are trusted, so they run plaintext and can manage devices.
                handle_connection(
                    ws,
                    hub,
                    accounts,
                    Codec::Plain,
                    Some(pairing),
                    None,
                    name,
                )
                .await;
            }
        });
    }
}

/// Runs one viewport connection over a WebSocket, whichever way it arrived: accepted locally
/// (`serve`) or dialed out to a relay. Generic over the stream so both share this exact routing.
/// The `codec` decides plaintext (local) vs encrypted (relay) framing; `pairing` is `Some` only
/// for the trusted local link, so only the desktop can create/list/revoke devices.
pub(crate) async fn handle_connection<S>(
    ws: WebSocketStream<S>,
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    codec: Codec,
    pairing: Option<Arc<PairingService>>,
    on_presence: Option<PresenceSink>,
    viewer_name: String,
) where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let viewer_id = NEXT_VIEWER.fetch_add(1, Ordering::Relaxed);
    // The first viewport to attach controls the terminals; a later one sees a takeover until it
    // takes control.
    let mut control_changes = hub.subscribe_control();
    hub.register_viewer(viewer_id, viewer_name);

    let codec = Arc::new(codec);
    let (mut sink, mut source) = ws.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Writer task: encode outbound messages (plaintext or encrypted) and send them, in order. A
    // keepalive ping on an idle link keeps the relay from dropping it and flushes queued pongs.
    let writer_codec = codec.clone();
    let writer = tokio::spawn(async move {
        let mut keepalive = tokio::time::interval(KEEPALIVE);
        keepalive.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                message = out_rx.recv() => {
                    let Some(message) = message else {
                        break;
                    };
                    let Some(frame) = writer_codec.encode(&message) else {
                        continue;
                    };
                    if sink.send(frame).await.is_err() {
                        break;
                    }
                }
                _ = keepalive.tick() => {
                    if sink.send(Message::Ping(Vec::new())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Change task: push workspace-list + keep-awake whenever the hub changes.
    let change_hub = hub.clone();
    let change_out = out_tx.clone();
    let mut changes = hub.subscribe_changes();
    let change_task = tokio::spawn(async move {
        loop {
            match changes.recv().await {
                Ok(()) => send_state(&change_hub, &change_out),
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Dir-change task: when a watched directory changes on disk, re-list it and push the update,
    // so the file tree stays live without the viewport polling.
    let dir_hub = hub.clone();
    let dir_out = out_tx.clone();
    let mut dir_changes = hub.subscribe_dir_changes();
    let dir_task = tokio::spawn(async move {
        loop {
            match dir_changes.recv().await {
                Ok((workspace, path)) => {
                    let entries = dir_hub.list_dir(&workspace, &path);
                    let _ = dir_out.send(ServerMessage::DirListing {
                        workspace,
                        path,
                        entries,
                    });
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Reset task: when a session's agent is relaunched (folders/account changed), tell this
    // viewport to re-attach so its terminal reflects the fresh process.
    let reset_out = out_tx.clone();
    let mut resets = hub.subscribe_resets();
    let reset_task = tokio::spawn(async move {
        loop {
            match resets.recv().await {
                Ok(session) => {
                    let _ = reset_out.send(ServerMessage::SessionReset { session });
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Devices task (local link only): push a fresh device list whenever a phone attaches / drops,
    // so the desktop's devices panel shows live connection state.
    let devices_task = pairing.as_ref().map(|pairing| {
        let devices_out = out_tx.clone();
        let devices_pairing = pairing.clone();
        let mut device_changes = pairing.subscribe_changes();
        tokio::spawn(async move {
            loop {
                match device_changes.recv().await {
                    Ok(()) => {
                        let _ = devices_out.send(ServerMessage::DeviceList {
                            devices: devices_pairing.list_devices(),
                        });
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        })
    });

    // Control task: push this viewport's control state now and whenever it changes. `holder` is
    // `None` when this viewport is the controller (render the terminal), else the controller's name.
    let control_hub = hub.clone();
    let control_out = out_tx.clone();
    let control_task = tokio::spawn(async move {
        loop {
            let holder = if control_hub.is_controller(viewer_id) {
                None
            } else {
                control_hub.controller_name()
            };
            let _ = control_out.send(ServerMessage::Control { holder });
            match control_changes.recv().await {
                Ok(()) => continue,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // All this connection's background tasks. The guard aborts them and releases control on scope
    // exit, and crucially also on cancellation: revoking a device aborts this connection's task, so
    // the cleanup must run from `Drop`, not from code after the loop (which cancellation skips).
    let mut tasks = vec![writer, change_task, dir_task, reset_task, control_task];
    if let Some(task) = devices_task {
        tasks.push(task);
    }
    let _guard = ConnectionGuard {
        hub: hub.clone(),
        viewer_id,
        tasks,
    };

    let mut connection = Connection::new(hub.clone(), accounts, pairing, out_tx, viewer_id);
    while let Some(Ok(message)) = source.next().await {
        if matches!(message, Message::Close(_)) {
            break;
        }
        // Relay control frames (peer presence) arrive as text and are not client messages; on a
        // device link they report whether the phone is attached.
        if let (Some(sink), Message::Text(text)) = (&on_presence, &message)
            && let Some(present) = parse_presence(text)
        {
            sink(present);
            continue;
        }
        if let Some(client) = codec.decode(message) {
            connection.handle(client);
        }
    }
}

/// Aborts a connection's background tasks and releases its control claim when the connection ends,
/// whether it returns normally or its task is cancelled (a revoked device's relay task is aborted).
/// Cancellation drops this in scope, so the cleanup always runs: aborting the writer drops the
/// socket (closing the relay link, so a remote viewport learns it went away), and unregistering the
/// viewport transfers control to a remaining one (so the desktop stops showing the takeover).
struct ConnectionGuard {
    hub: Arc<WorkspaceService>,
    viewer_id: u64,
    tasks: Vec<tokio::task::JoinHandle<()>>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        for task in &self.tasks {
            task.abort();
        }
        self.hub.unregister_viewer(self.viewer_id);
    }
}

/// Parses a relay presence control frame (`{"__relay":"presence","peers":n}`), returning whether
/// the other peer is present (`peers > 1`). `None` for any other frame.
fn parse_presence(text: &str) -> Option<bool> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    if value.get("__relay").and_then(|v| v.as_str()) != Some("presence") {
        return None;
    }

    Some(value.get("peers").and_then(|v| v.as_u64()).unwrap_or(0) > 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presence_frame_reports_the_other_peer() {
        // Only the daemon in the room: the phone is not present.
        assert_eq!(
            parse_presence(r#"{"__relay":"presence","peers":1}"#),
            Some(false)
        );
        // Both peers: the phone is present.
        assert_eq!(
            parse_presence(r#"{"__relay":"presence","peers":2}"#),
            Some(true)
        );
    }

    #[test]
    fn non_presence_frames_are_ignored() {
        // A real client message must not be mistaken for presence.
        assert_eq!(parse_presence(r#"{"type":"list-workspaces"}"#), None);
        assert_eq!(parse_presence("not json"), None);
    }
}
