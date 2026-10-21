use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, watch};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

use soromi_protocol::{ClientMessage, KeepAwakeMode, ServerMessage};

use super::coalesce::until;
use super::codec::{Codec, Received};
use super::connection::Connection;
use super::outbound::{Closed, Frame, LinkState, Outbound, WireStats, message_kind};
use crate::accounts::store::FileAccountManager;
use crate::pairing::PairingService;
use crate::workspaces::service::{Change, WorkspaceService};

/// Called with a device link's live presence (`true` once the phone is there, `false` when it
/// drops).
pub(crate) type PresenceSink = Arc<dyn Fn(bool) + Send + Sync>;

/// What a paired device's link carries besides the socket: which device it is, where to report
/// that it is there, and the direct routes to tell it about.
#[derive(Clone)]
pub(crate) struct DeviceLink {
    /// The device's id, so its links are known to be the same phone.
    pub id: String,
    pub on_presence: PresenceSink,
    /// Where the device can reach this computer without the relay; it is told on `Hello` and again
    /// whenever this changes.
    pub routes: watch::Receiver<Vec<String>>,
}

/// How a connection reaches its client, which decides when a client counts as being there.
#[derive(Clone)]
pub(crate) enum Link {
    /// A client is on the other end from the first byte: the desktop app on this machine.
    Local,
    /// The daemon's standing connection to a device's relay room. A device is on the other end
    /// only while the relay says so.
    Relay(DeviceLink),
    /// A socket a device opened straight to this machine. Anyone on the network can open one, so
    /// it counts for nothing until it sends a frame sealed with the device's key.
    Direct(DeviceLink),
}

impl Link {
    fn device(&self) -> Option<&DeviceLink> {
        match self {
            Link::Local => None,
            Link::Relay(device) | Link::Direct(device) => Some(device),
        }
    }
}

/// How long a direct socket has to send a frame sealed with its device's key. Past that it is
/// someone who does not hold the key, and is dropped.
const PROOF_LIMIT: Duration = Duration::from_secs(10);

/// How often the connection sends a keepalive ping. Shorter than the relay's heartbeat, so an idle
/// link stays alive and any queued pong is flushed before the relay would drop it.
const KEEPALIVE: Duration = Duration::from_secs(20);

/// How long a link may stay silent before it is taken for dead. Every ping is answered with a pong,
/// so a live link is heard from at least once per [`KEEPALIVE`]; two missed in a row means the other
/// end is gone even though the socket has not said so (a dropped network, a suspended relay).
const SILENCE_LIMIT: Duration = Duration::from_secs(45);

/// The close code a relay sends a socket whose place in the room was taken by another one.
pub(crate) const CLOSE_REPLACED: u16 = 4002;

/// The shortest gap between two rounds of state updates to one viewport. The first change after a
/// quiet spell goes out at once; changes that pile up inside the gap are merged into one round.
const CHANGE_WINDOW: Duration = Duration::from_millis(50);

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
    let output = std::process::Command::new(command)
        .args(args)
        .output()
        .ok()?;
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
            // A keystroke and its echo are tiny packets; never hold one back to batch it.
            let _ = stream.set_nodelay(true);
            if let Ok(ws) = accept_async(stream).await {
                // Local links are trusted, so they run plaintext and can manage devices.
                handle_connection(
                    ws,
                    hub,
                    accounts,
                    Codec::Plain,
                    Some(pairing),
                    Link::Local,
                    name,
                )
                .await;
            }
        });
    }
}

/// Runs one viewport connection over a WebSocket, whichever way it arrived: accepted locally
/// (`serve`), dialed out to a relay, or accepted from a device on the network. Generic over the
/// stream so all share this exact routing. The `codec` decides plaintext (local) vs encrypted
/// (device) framing; `pairing` is `Some` only for the trusted local link, so only the desktop can
/// create/list/revoke devices; `link` says when a client counts as being there.
///
/// Returns the close code the other end gave, if it closed the link with one.
pub(crate) async fn handle_connection<S>(
    ws: WebSocketStream<S>,
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    codec: Codec,
    pairing: Option<Arc<PairingService>>,
    link_kind: Link,
    viewer_name: String,
) -> Option<u16>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let viewer_id = NEXT_VIEWER.fetch_add(1, Ordering::Relaxed);
    // A local link has its client from the first byte. A relay link is the daemon's standing
    // connection to the relay: it counts as a viewport only while a device is actually on the other
    // end, so an absent phone neither holds terminal control nor has state uploaded for it. A direct
    // socket counts only once it has proved it holds the device's key.
    let local = matches!(link_kind, Link::Local);
    let link = Arc::new(LinkState::new(local));
    let mut control_changes = hub.subscribe_control();
    // Registers this connection as a viewport: on its own, or as one of a device's links.
    let register = {
        let hub = hub.clone();
        let name = viewer_name.clone();
        let device = link_kind.device().map(|device| device.id.clone());
        move || match &device {
            Some(device) => hub.register_device_viewer(viewer_id, name.clone(), device),
            None => hub.register_viewer(viewer_id, name.clone()),
        }
    };
    if local {
        // The first viewport to attach controls the terminals; a later one sees a takeover until it
        // takes control.
        register();
    }

    let codec = Arc::new(codec);
    let (mut sink, mut source) = ws.split();
    let (out, mut out_rx, stalled) = Outbound::channel();
    let stats = WireStats::from_env();

    // Writer task: encode outbound frames (plaintext or encrypted) and send them, in order. Frames
    // that are already waiting go out in one flush. A keepalive ping on an idle link keeps the relay
    // from dropping it and flushes queued pongs.
    let writer_codec = codec.clone();
    let writer_stats = stats.clone();
    let writer = tokio::spawn(async move {
        let mut keepalive = tokio::time::interval(KEEPALIVE);
        keepalive.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                frame = out_rx.recv() => {
                    let Some(frame) = frame else {
                        break;
                    };
                    let mut next = Some(frame);
                    let mut failed = false;
                    while let Some(frame) = next {
                        if let Some(message) = encode(&writer_codec, frame, writer_stats.as_ref())
                            && sink.feed(message).await.is_err()
                        {
                            failed = true;
                            break;
                        }
                        next = out_rx.try_recv().ok();
                    }
                    if failed || sink.flush().await.is_err() {
                        break;
                    }
                }
                _ = keepalive.tick() => {
                    if sink.send(Message::Ping(Vec::new())).await.is_err() {
                        break;
                    }
                    if let Some(stats) = &writer_stats
                        && let Ok(stats) = stats.lock()
                    {
                        eprintln!("soromi: wire stats (viewer {viewer_id}): {}", stats.report());
                    }
                }
            }
        }
    });

    // Change task: tell this viewport what changed in the hub, and only that.
    let change_task = tokio::spawn(forward_changes(
        hub.clone(),
        out.clone(),
        link.clone(),
        hub.subscribe_changes(),
    ));

    // Dir-change task: when a directory this viewport has listed changes on disk, re-list it and
    // push the update, so the file tree stays live without the viewport polling.
    let dir_hub = hub.clone();
    let dir_out = out.clone();
    let dir_link = link.clone();
    let mut dir_changes = hub.subscribe_dir_changes();
    let dir_task = tokio::spawn(async move {
        loop {
            match dir_changes.recv().await {
                Ok((workspace, path)) => {
                    if !dir_link.is_ready() || !dir_link.has_listed(&workspace, &path) {
                        continue;
                    }
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

    // Sessions whose agent was started over (the workspace's folders or accounts changed, or the
    // session was moved to another agent). Dealt with in the loop below, where the connection is.
    let mut resets = hub.subscribe_resets();

    // Devices task (local link only): push a fresh device list whenever a phone attaches / drops,
    // so the desktop's devices panel shows live connection state.
    let devices_task = pairing.as_ref().map(|pairing| {
        let devices_out = out.clone();
        let devices_pairing = pairing.clone();
        let devices_link = link.clone();
        let mut device_changes = pairing.subscribe_changes();
        tokio::spawn(async move {
            loop {
                match device_changes.recv().await {
                    Ok(()) => {
                        if devices_link.is_ready() {
                            let _ = devices_out.send(ServerMessage::DeviceList {
                                devices: devices_pairing.list_devices(),
                            });
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        })
    });

    // Control task: push this viewport's control state whenever it changes (it learns the state it
    // starts with when it asks for the workspace list). `holder` is `None` when this viewport is the
    // controller (render the terminal), else the controller's name.
    let control_hub = hub.clone();
    let control_out = out.clone();
    let control_link = link.clone();
    let control_task = tokio::spawn(async move {
        loop {
            match control_changes.recv().await {
                Ok(()) | Err(broadcast::error::RecvError::Lagged(_)) => {}
                Err(broadcast::error::RecvError::Closed) => break,
            }
            if control_link.is_ready() {
                let holder = if control_hub.is_controller(viewer_id) {
                    None
                } else {
                    control_hub.controller_name()
                };
                let _ = control_out.send(ServerMessage::Control { holder });
            }
        }
    });

    // Routes task (device links only): when the addresses this computer can be reached at change
    // (it joined another network, direct access was turned off), tell the device.
    let routes_task = link_kind.device().map(|device| {
        let routes_out = out.clone();
        let routes_link = link.clone();
        let mut routes = device.routes.clone();
        tokio::spawn(async move {
            while routes.changed().await.is_ok() {
                if routes_link.is_ready() {
                    let routes = routes.borrow_and_update().clone();
                    let _ = routes_out.send(ServerMessage::Routes { routes });
                }
            }
        })
    });

    // All this connection's background tasks. The guard aborts them and releases control on scope
    // exit, and crucially also on cancellation: revoking a device aborts this connection's task, so
    // the cleanup must run from `Drop`, not from code after the loop (which cancellation skips).
    let mut tasks = vec![writer, change_task, dir_task, control_task];
    tasks.extend(devices_task);
    tasks.extend(routes_task);
    let _guard = ConnectionGuard {
        hub: hub.clone(),
        viewer_id,
        tasks,
        stats,
    };

    let mut connection = Connection::new(
        hub.clone(),
        accounts,
        pairing,
        out.clone(),
        link.clone(),
        viewer_id,
    );
    if let Some(device) = link_kind.device() {
        connection.set_device(device.id.clone(), device.routes.clone());
    }
    // A link that leaves this machine does not survive its sleep: the other end gave up on it
    // while it was frozen. The desktop's own link is on this machine and sleeps with it.
    let mut wakes = crate::power::wakes();
    // On the runtime's clock, like the timer that checks it.
    let mut last_heard = tokio::time::Instant::now();
    // A direct socket is on trial until it sends a frame only its device could have sealed.
    let proof_due =
        matches!(link_kind, Link::Direct(_)).then(|| tokio::time::Instant::now() + PROOF_LIMIT);
    // Whether the device has yet to speak in the session it last started: its first message there
    // is what says it now talks through this link.
    let mut fresh_session = true;
    loop {
        let message = tokio::select! {
            message = source.next() => message,
            // A session's agent was started over. What this viewport was following of it belongs
            // to the process that is gone: it is put on the new one here, and told, so a terminal
            // can clear itself and attach again.
            reset = resets.recv() => {
                match reset {
                    Ok(session) => {
                        if link.is_ready() {
                            connection.session_restarted(&session);
                            let _ = out.send(ServerMessage::SessionReset { session });
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => break,
                }
                continue;
            }
            // A reply found the queue full: the client is too far behind to catch up. Dropping the
            // link makes it reconnect and start from a fresh snapshot.
            _ = stalled.notified() => {
                eprintln!("soromi: dropping viewer {viewer_id}: it fell too far behind");
                break;
            }
            // Not even a pong: the link is dead. Dropping it lets a relay link dial again.
            _ = tokio::time::sleep_until(last_heard + SILENCE_LIMIT) => {
                eprintln!("soromi: dropping viewer {viewer_id}: the link went silent");
                break;
            }
            // A direct socket that never proved it holds the key.
            _ = until_proof(proof_due, &link) => break,
            // The machine slept. Whatever this socket was, it is dead on the far side; ending it
            // here lets a relay link dial again now instead of once the silence is noticed.
            Ok(()) = wakes.changed(), if !local => {
                eprintln!("soromi: dropping viewer {viewer_id}: the machine woke from sleep");
                break;
            }
        };
        let Some(Ok(message)) = message else {
            break;
        };
        last_heard = tokio::time::Instant::now();
        if let Message::Close(frame) = message {
            return frame.map(|frame| frame.code.into());
        }
        // Relay control frames (peer presence) arrive as text and are not client messages; on a
        // device's relay link they report whether the phone is attached.
        if let (Link::Relay(device), Message::Text(text)) = (&link_kind, &message)
            && let Some(present) = parse_presence(text)
        {
            (device.on_presence)(present);
            if link.set_present(present) {
                if present {
                    register();
                } else {
                    // The device left: stop streaming to it, end its encrypted session, and give
                    // up its control claim.
                    connection.reset_client();
                    codec.end_session();
                    hub.unregister_viewer(viewer_id);
                }
            }
            continue;
        }
        let received = codec.receive(message);
        match &link_kind {
            Link::Local => {}
            // A relay that never announces presence still proves a device is there by delivering
            // what it sends.
            Link::Relay(_) => {
                if matches!(received, Received::Payload(_) | Received::Opened(_))
                    && link.set_present(true)
                {
                    register();
                }
            }
            // On a direct socket only a frame that opened with the session's keys is proof: asking
            // for a session takes no key at all.
            Link::Direct(device) => {
                if matches!(received, Received::Payload(_)) && link.set_present(true) {
                    register();
                    (device.on_presence)(true);
                }
            }
        }
        match received {
            Received::Payload(payload) => {
                if fresh_session && link_kind.device().is_some() {
                    fresh_session = false;
                    hub.follow_device(viewer_id);
                }
                if let Ok(client) = serde_json::from_slice::<ClientMessage>(&payload) {
                    connection.handle(client);
                }
            }
            // A device started an encrypted session, so it is starting over: what the last session
            // had attached is void, and its answer takes its place in the queue.
            Received::Opened(start) => {
                fresh_session = true;
                connection.reset_client();
                if out.session(start).is_err() {
                    break;
                }
            }
            Received::Accepted | Received::Nothing => {}
        }
    }
    None
}

/// Resolves when a direct socket's time to prove itself is up and it has not; never for a link
/// that has, or that is not on trial.
async fn until_proof(due: Option<tokio::time::Instant>, link: &LinkState) {
    match due {
        Some(due) if !link.is_present() => tokio::time::sleep_until(due).await,
        _ => std::future::pending().await,
    }
}

/// Turns a queued frame into a WebSocket message, tallying it when stats are on.
fn encode(codec: &Codec, frame: Frame, stats: Option<&Arc<Mutex<WireStats>>>) -> Option<Message> {
    let frame = match frame {
        Frame::Session(start) => return Some(codec.begin(start)),
        frame => frame,
    };
    let (payload, text) = frame.into_payload()?;
    let kind = stats.map(|_| {
        if text {
            message_kind(&payload).to_string()
        } else {
            "terminal".to_string()
        }
    });
    let message = codec.seal(payload, text)?;
    if let (Some(stats), Some(kind)) = (stats, kind)
        && let Ok(mut stats) = stats.lock()
    {
        stats.record(&kind, message.len());
    }
    Some(message)
}

/// What one viewport was last told of the app-wide state, so it is only sent again when it changes.
#[derive(Default)]
struct SentState {
    keep_awake: Option<(bool, KeepAwakeMode)>,
    update: Option<String>,
}

/// Sends a viewport the app-wide state that is outside the workspace list: only what differs from
/// what it was last told.
async fn send_app_state(
    hub: &WorkspaceService,
    out: &Outbound,
    sent: &mut SentState,
) -> Result<(), Closed> {
    let keep_awake = (hub.keep_awake_active(), hub.keep_awake_mode());
    if sent.keep_awake != Some(keep_awake) {
        sent.keep_awake = Some(keep_awake);
        out.stream_message(ServerMessage::KeepAwake {
            active: keep_awake.0,
            mode: keep_awake.1,
        })
        .await?;
    }
    if let Some(update) = hub.update_info()
        && sent.update.as_deref() != Some(update.version.as_str())
    {
        sent.update = Some(update.version.clone());
        out.stream_message(ServerMessage::UpdateAvailable {
            version: update.version,
            url: update.url,
            notes: update.notes,
        })
        .await?;
    }
    Ok(())
}

/// Follows the hub's change signal for one viewport: the whole workspace list only when its
/// structure changed, and otherwise just the sessions that did. Rounds are at least
/// [`CHANGE_WINDOW`] apart, with everything that changed in between merged — waiting for room in the
/// queue merges further, so a slow link is sent the latest state rather than every step.
async fn forward_changes(
    hub: Arc<WorkspaceService>,
    out: Outbound,
    link: Arc<LinkState>,
    mut changes: broadcast::Receiver<Change>,
) {
    let mut sent = SentState::default();
    let mut sent_to = link.client();
    let mut structure = false;
    let mut global = false;
    let mut sessions: Vec<String> = Vec::new();
    let mut next_round = Instant::now();
    loop {
        let pending = structure || global || !sessions.is_empty();
        tokio::select! {
            change = changes.recv() => match change {
                Ok(Change::Structure) => structure = true,
                Ok(Change::Global) => global = true,
                Ok(Change::Session(id)) => {
                    if !sessions.contains(&id) {
                        sessions.push(id);
                    }
                }
                // Some changes were missed, so anything may be stale: resend the lot.
                Err(broadcast::error::RecvError::Lagged(_)) => structure = true,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            _ = until(pending.then_some(next_round)) => {
                let whole_list = std::mem::take(&mut structure);
                let changed = std::mem::take(&mut sessions);
                global = false;
                next_round = Instant::now() + CHANGE_WINDOW;
                // Nobody is listening yet; a client that arrives asks for the list itself.
                if !link.is_ready() {
                    continue;
                }
                // What was sent before went to another client; this one is owed its own copy.
                let client = link.client();
                if client != sent_to {
                    sent_to = client;
                    sent = SentState::default();
                }
                if send_round(&hub, &out, &mut sent, whole_list, changed).await.is_err() {
                    break;
                }
            }
        }
    }
}

/// One round of state updates: the list (or the changed sessions), then any app-wide state.
async fn send_round(
    hub: &WorkspaceService,
    out: &Outbound,
    sent: &mut SentState,
    whole_list: bool,
    changed: Vec<String>,
) -> Result<(), Closed> {
    if whole_list {
        out.stream_message(ServerMessage::WorkspaceList {
            workspaces: hub.summaries(),
        })
        .await?;
    } else {
        for id in changed {
            // A session that vanished in the meantime is covered by the structure change it caused.
            if let Some((workspace, status, session)) = hub.session_update(&id) {
                out.stream_message(ServerMessage::SessionUpdated {
                    workspace,
                    status,
                    session,
                })
                .await?;
            }
        }
    }
    send_app_state(hub, out, sent).await
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
    stats: Option<Arc<Mutex<WireStats>>>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        for task in &self.tasks {
            task.abort();
        }
        self.hub.unregister_viewer(self.viewer_id);
        if let Some(stats) = &self.stats
            && let Ok(stats) = stats.lock()
        {
            eprintln!(
                "soromi: wire stats (viewer {}, closed): {}",
                self.viewer_id,
                stats.report()
            );
        }
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

    /// The far end of a relay link: what the relay and a paired device, between them, put on the
    /// daemon's socket.
    type Far = WebSocketStream<tokio::io::DuplexStream>;

    /// Starts the handler on one end of an in-memory relay link (encrypted, presence-driven) and
    /// returns the hub plus the far end.
    async fn relay_link(key: &str) -> (Arc<WorkspaceService>, Far) {
        use crate::keep_awake::backend::NoopKeepAwake;
        use crate::keep_awake::controller::KeepAwakeController;
        use crate::notifications::controller::NotificationController;
        use crate::notifications::notifier::NoopNotifier;
        use crate::sound::player::NoopSoundPlayer;

        let notifications = Arc::new(NotificationController::new(Arc::new(NoopNotifier)));
        let keep_awake = Arc::new(KeepAwakeController::new(
            Arc::new(NoopKeepAwake),
            KeepAwakeMode::Off,
        ));
        let hub = WorkspaceService::new(notifications, keep_awake, Arc::new(NoopSoundPlayer), None);

        let (near, far) = tokio::io::duplex(1 << 20);
        let handler_hub = hub.clone();
        let codec = Codec::from_key_base64(key).unwrap();
        tokio::spawn(async move {
            let ws = accept_async(near).await.unwrap();
            let device = DeviceLink {
                id: "d1".to_string(),
                on_presence: Arc::new(|_| {}),
                routes: watch::channel(Vec::new()).1,
            };
            handle_connection(
                ws,
                handler_hub,
                Arc::new(FileAccountManager),
                codec,
                None,
                Link::Relay(device),
                "Phone".to_string(),
            )
            .await;
        });
        let (far, _) = tokio_tungstenite::client_async("ws://relay.test/", far)
            .await
            .unwrap();
        (hub, far)
    }

    /// How many data frames arrive until the link has been quiet for 200 ms.
    async fn frames(far: &mut Far) -> usize {
        let mut count = 0;
        while let Ok(Some(Ok(frame))) =
            tokio::time::timeout(Duration::from_millis(200), far.next()).await
        {
            if matches!(frame, Message::Text(_) | Message::Binary(_)) {
                count += 1;
            }
        }
        count
    }

    async fn presence(far: &mut Far, peers: u8) {
        far.send(Message::Text(format!(
            r#"{{"__relay":"presence","peers":{peers}}}"#
        )))
        .await
        .unwrap();
    }

    /// Starts an encrypted session from the far end, as a paired device does on arriving, and
    /// returns the device's end of it.
    async fn open_session(far: &mut Far, key: &str) -> Codec {
        let device = Codec::device_from_key_base64(key).unwrap();
        far.send(device.open_session().unwrap()).await.unwrap();
        loop {
            let frame = tokio::time::timeout(Duration::from_secs(2), far.next())
                .await
                .expect("the daemon did not answer the session request")
                .unwrap()
                .unwrap();
            if matches!(device.receive(frame), Received::Accepted) {
                return device;
            }
        }
    }

    /// The types of the messages that arrive until the link has been quiet for 200 ms.
    async fn received(far: &mut Far, codec: &Codec) -> Vec<String> {
        let mut types = Vec::new();
        while let Ok(Some(Ok(frame))) =
            tokio::time::timeout(Duration::from_millis(200), far.next()).await
        {
            if let Some(payload) = codec.open(frame) {
                types.push(message_kind(&payload).to_string());
            }
        }
        types
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn a_relay_link_serves_a_device_only_while_one_is_present() {
        const KEY: &str = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let (hub, mut far) = relay_link(KEY).await;

        // Only the daemon is in the room: the link holds no control and nothing crosses it.
        presence(&mut far, 1).await;
        hub.set_keep_awake_mode(KeepAwakeMode::Always);
        assert_eq!(frames(&mut far).await, 0);
        assert_eq!(hub.controller_name(), None);

        // A device joins and starts its session: it becomes a viewport, but is sent nothing until
        // it says hello.
        presence(&mut far, 2).await;
        let codec = open_session(&mut far, KEY).await;
        hub.set_keep_awake_mode(KeepAwakeMode::Off);
        assert_eq!(received(&mut far, &codec).await, Vec::<String>::new());
        assert_eq!(hub.controller_name().as_deref(), Some("Phone"));

        // A device that skips the hello is told to update, once, and nothing else.
        let say = |text: String| codec.seal(text.into_bytes(), true).unwrap();
        let ask = r#"{"type":"list-workspaces"}"#.to_string();
        far.send(say(ask.clone())).await.unwrap();
        far.send(say(ask.clone())).await.unwrap();
        assert_eq!(received(&mut far, &codec).await, vec!["incompatible"]);

        // After its hello it gets what it asks for, then only what changes.
        let hello = format!(
            r#"{{"type":"hello","protocol":{},"clientId":"phone"}}"#,
            soromi_protocol::PROTOCOL_VERSION
        );
        far.send(say(hello)).await.unwrap();
        far.send(say(ask)).await.unwrap();
        assert_eq!(
            received(&mut far, &codec).await,
            // Its welcome comes with the direct routes it can also try (none here).
            vec![
                "welcome",
                "routes",
                "workspace-list",
                "keep-awake",
                "control"
            ]
        );
        hub.set_keep_awake_mode(KeepAwakeMode::Always);
        assert_eq!(received(&mut far, &codec).await, vec!["keep-awake"]);

        // The device leaves: control is released, its session ends, and the uploads stop.
        presence(&mut far, 1).await;
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(hub.controller_name(), None);
        hub.set_keep_awake_mode(KeepAwakeMode::Off);
        assert_eq!(frames(&mut far).await, 0);

        // What the device sent before is noise now, even while a device is in the room again: a
        // recording of an old session gets no answer.
        presence(&mut far, 2).await;
        let replayed = format!(
            r#"{{"type":"hello","protocol":{},"clientId":"phone"}}"#,
            soromi_protocol::PROTOCOL_VERSION
        );
        far.send(say(replayed)).await.unwrap();
        assert_eq!(frames(&mut far).await, 0);

        // A new session serves it again from scratch.
        let codec = open_session(&mut far, KEY).await;
        let say = |text: String| codec.seal(text.into_bytes(), true).unwrap();
        let hello = format!(
            r#"{{"type":"hello","protocol":{},"clientId":"phone"}}"#,
            soromi_protocol::PROTOCOL_VERSION
        );
        far.send(say(hello)).await.unwrap();
        assert_eq!(received(&mut far, &codec).await, vec!["welcome", "routes"]);

        crate::home::set_soromi_home(None);
    }

    #[tokio::test(start_paused = true)]
    #[serial_test::serial]
    async fn a_link_that_goes_silent_is_dropped() {
        const KEY: &str = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let (_hub, mut far) = relay_link(KEY).await;

        // The far end stops reading, so the daemon's pings go unanswered.
        tokio::time::sleep(SILENCE_LIMIT + Duration::from_secs(1)).await;

        // All that is left on the link is the pings it ignored, then the end of the stream.
        let ended = loop {
            match tokio::time::timeout(Duration::from_secs(1), far.next()).await {
                Ok(Some(Ok(_))) => continue,
                Ok(None) | Ok(Some(Err(_))) => break true,
                Err(_) => break false,
            }
        };
        assert!(ended, "a silent link was kept open");

        crate::home::set_soromi_home(None);
    }

    #[tokio::test(start_paused = true)]
    #[serial_test::serial]
    async fn a_quiet_link_that_answers_pings_is_kept() {
        const KEY: &str = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        let (_hub, mut far) = relay_link(KEY).await;

        // Reading is what answers pings. Nothing else crosses the link, well past the limit.
        let open = tokio::time::timeout(SILENCE_LIMIT * 3, async {
            while let Some(Ok(_)) = far.next().await {}
        })
        .await;
        assert!(open.is_err(), "a link that answers pings was dropped");

        crate::home::set_soromi_home(None);
    }

    #[test]
    fn non_presence_frames_are_ignored() {
        // A real client message must not be mistaken for presence.
        assert_eq!(parse_presence(r#"{"type":"list-workspaces"}"#), None);
        assert_eq!(parse_presence("not json"), None);
    }
}
