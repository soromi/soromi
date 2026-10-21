//! Drives the real WebSocket server the way a client does, pinning what it is sent: the version
//! handshake, binary terminal frames, per-session updates in place of the whole workspace list, and
//! directory updates only for directories it listed.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use soromi_daemon::accounts::store::FileAccountManager;
use soromi_daemon::keep_awake::backend::NoopKeepAwake;
use soromi_daemon::keep_awake::controller::KeepAwakeController;
use soromi_daemon::notifications::controller::NotificationController;
use soromi_daemon::notifications::notifier::NoopNotifier;
use soromi_daemon::sound::player::NoopSoundPlayer;
use soromi_daemon::transport::server::serve;
use soromi_daemon::workspaces::service::WorkspaceService;
use soromi_protocol::{KeepAwakeMode, PROTOCOL_VERSION, TERMINAL_OUTPUT};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// A daemon serving on a free port, with its own temporary home and workspace root.
struct Daemon {
    addr: std::net::SocketAddr,
    /// The workspace root, with symlinks resolved: the directory watcher matches on real paths, and
    /// a temporary directory on macOS sits behind one.
    root: std::path::PathBuf,
    _root: tempfile::TempDir,
    _home: tempfile::TempDir,
}

impl Daemon {
    async fn start() -> Self {
        let home = tempfile::tempdir().unwrap();
        soromi_daemon::home::set_soromi_home(Some(home.path().to_path_buf()));
        let root = tempfile::tempdir().unwrap();

        let notifications = Arc::new(NotificationController::new(Arc::new(NoopNotifier)));
        let keep_awake = Arc::new(KeepAwakeController::new(
            Arc::new(NoopKeepAwake),
            KeepAwakeMode::Off,
        ));
        let hub = WorkspaceService::new(notifications, keep_awake, Arc::new(NoopSoundPlayer), None);
        let accounts = Arc::new(FileAccountManager);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let pairing = soromi_daemon::pairing::PairingService::new(
            hub.clone(),
            accounts.clone(),
            "ws://localhost:8787".to_string(),
            "soromi".to_string(),
            // Any free port: the machine's own daemon may hold the usual one.
            soromi_daemon::pairing::DirectSettings {
                enabled: true,
                port: 0,
            },
        );
        tokio::spawn(serve(listener, hub, accounts, pairing));

        Self {
            addr,
            root: root.path().canonicalize().unwrap(),
            _root: root,
            _home: home,
        }
    }

    /// Opens a socket and says nothing yet.
    async fn open(&self) -> Socket {
        let (ws, _) = tokio_tungstenite::connect_async(format!("ws://{}", self.addr))
            .await
            .unwrap();
        ws
    }

    /// Connects and completes the version handshake.
    async fn connect(&self) -> Socket {
        let mut ws = self.open().await;
        send(
            &mut ws,
            json!({ "type": "hello", "protocol": PROTOCOL_VERSION, "clientId": "test" }),
        )
        .await;
        let welcome = read_until(&mut ws, "welcome").await;
        assert_eq!(welcome["protocol"], PROTOCOL_VERSION);
        ws
    }

    /// Creates a one-session space running `agent` and returns the session id.
    async fn create_space(&self, ws: &mut Socket, agent: &str) -> String {
        send(
            ws,
            json!({
                "type": "create-space",
                "name": "kazomi",
                "root": self.root.to_string_lossy(),
                "agent": agent,
                "account": "personal"
            }),
        )
        .await;
        read_until(ws, "workspace-opened").await;
        send(ws, json!({ "type": "list-workspaces" })).await;
        let list = read_until(ws, "workspace-list").await;
        list["workspaces"][0]["sessions"][0]["id"]
            .as_str()
            .expect("session id")
            .to_string()
    }
}

impl Drop for Daemon {
    fn drop(&mut self) {
        soromi_daemon::home::set_soromi_home(None);
    }
}

async fn send(ws: &mut Socket, value: Value) {
    ws.send(Message::Text(value.to_string())).await.unwrap();
}

/// The next data frame, or `None` once `wait` passes with nothing.
async fn next_frame(ws: &mut Socket, wait: Duration) -> Option<Message> {
    loop {
        match tokio::time::timeout(wait, ws.next()).await {
            Err(_) => return None,
            Ok(frame) => match frame.expect("stream ended").expect("websocket error") {
                frame @ (Message::Text(_) | Message::Binary(_)) => return Some(frame),
                _ => continue,
            },
        }
    }
}

/// Reads until a JSON message of type `ty` arrives, skipping everything else.
async fn read_until(ws: &mut Socket, ty: &str) -> Value {
    loop {
        let frame = next_frame(ws, Duration::from_secs(5))
            .await
            .unwrap_or_else(|| panic!("timed out waiting for `{ty}`"));
        if let Message::Text(text) = frame {
            let value: Value = serde_json::from_str(&text).expect("valid json");
            if value["type"] == ty {
                return value;
            }
        }
    }
}

/// Every JSON message type seen until the link has been quiet for `quiet`.
async fn drain_types(ws: &mut Socket, quiet: Duration) -> Vec<String> {
    let mut types = Vec::new();
    while let Some(frame) = next_frame(ws, quiet).await {
        if let Message::Text(text) = frame {
            let value: Value = serde_json::from_str(&text).expect("valid json");
            types.push(value["type"].as_str().unwrap_or_default().to_string());
        }
    }
    types
}

/// Reads binary terminal frames for `slot` until their combined text contains `needle`.
async fn terminal_contains(ws: &mut Socket, slot: u16, needle: &str) -> bool {
    let mut seen = String::new();
    while let Some(frame) = next_frame(ws, Duration::from_secs(5)).await {
        if let Message::Binary(bytes) = frame {
            assert_eq!(
                bytes[0], TERMINAL_OUTPUT,
                "a terminal frame leads with its opcode"
            );
            assert_eq!(u16::from_be_bytes([bytes[1], bytes[2]]), slot);
            seen.push_str(std::str::from_utf8(&bytes[3..]).expect("utf-8 output"));
            if seen.contains(needle) {
                return true;
            }
        }
    }
    false
}

#[tokio::test]
#[serial_test::serial]
async fn a_client_on_another_version_is_told_which_side_to_update() {
    let daemon = Daemon::start().await;

    let mut older = daemon.open().await;
    send(
        &mut older,
        json!({ "type": "hello", "protocol": PROTOCOL_VERSION - 1, "clientId": "old" }),
    )
    .await;
    let reply = read_until(&mut older, "incompatible").await;
    assert_eq!(reply["action"], "update-client");
    assert_eq!(reply["protocol"], PROTOCOL_VERSION);

    let mut newer = daemon.open().await;
    send(
        &mut newer,
        json!({ "type": "hello", "protocol": PROTOCOL_VERSION + 1, "clientId": "new" }),
    )
    .await;
    assert_eq!(
        read_until(&mut newer, "incompatible").await["action"],
        "update-daemon"
    );
}

#[tokio::test]
#[serial_test::serial]
async fn a_ping_is_echoed_with_its_nonce() {
    let daemon = Daemon::start().await;
    let mut ws = daemon.connect().await;

    send(&mut ws, json!({ "type": "ping", "nonce": 41 })).await;
    assert_eq!(read_until(&mut ws, "pong").await["nonce"], 41);
}

#[tokio::test]
#[serial_test::serial]
async fn terminal_output_arrives_as_binary_frames() {
    let daemon = Daemon::start().await;
    let mut ws = daemon.connect().await;
    let session = daemon.create_space(&mut ws, "/bin/cat").await;

    send(&mut ws, json!({ "type": "attach", "session": session })).await;
    let attached = read_until(&mut ws, "attached").await;
    assert_eq!(attached["session"], session.as_str());
    let slot = attached["slot"].as_u64().expect("slot") as u16;

    // The attach repaint leads with a terminal reset, then live output follows on the same slot.
    assert!(terminal_contains(&mut ws, slot, "\u{1b}c").await);
    send(
        &mut ws,
        json!({ "type": "input", "session": session, "data": "ping\n" }),
    )
    .await;
    assert!(
        terminal_contains(&mut ws, slot, "ping").await,
        "did not receive the echoed output"
    );
}

#[tokio::test]
#[serial_test::serial]
async fn a_detached_session_stops_streaming_until_it_is_attached_again() {
    let daemon = Daemon::start().await;
    let mut ws = daemon.connect().await;
    let session = daemon.create_space(&mut ws, "/bin/cat").await;
    send(&mut ws, json!({ "type": "attach", "session": session })).await;
    let slot = read_until(&mut ws, "attached").await["slot"]
        .as_u64()
        .expect("slot") as u16;
    assert!(terminal_contains(&mut ws, slot, "\u{1b}c").await);

    send(&mut ws, json!({ "type": "detach", "session": session })).await;
    drain_types(&mut ws, Duration::from_millis(300)).await;
    send(
        &mut ws,
        json!({ "type": "input", "session": session, "data": "quiet\n" }),
    )
    .await;
    let mut binary_frames = 0;
    while let Some(frame) = next_frame(&mut ws, Duration::from_millis(400)).await {
        if matches!(frame, Message::Binary(_)) {
            binary_frames += 1;
        }
    }
    assert_eq!(binary_frames, 0, "output kept streaming after detach");

    // Attaching again repaints from the scrollback, which includes what was missed.
    send(&mut ws, json!({ "type": "attach", "session": session })).await;
    assert!(terminal_contains(&mut ws, slot, "quiet").await);
}

#[tokio::test]
#[serial_test::serial]
async fn a_session_change_is_sent_as_that_session_only() {
    let daemon = Daemon::start().await;
    let mut ws = daemon.connect().await;
    let session = daemon.create_space(&mut ws, "/bin/cat").await;
    send(&mut ws, json!({ "type": "attach", "session": session })).await;
    // Let the list and attach traffic from setup settle before watching what a change sends.
    drain_types(&mut ws, Duration::from_millis(400)).await;

    // Submitting input marks the session as working: a change to that one session.
    send(
        &mut ws,
        json!({ "type": "input", "session": session, "data": "go\r" }),
    )
    .await;
    let update = read_until(&mut ws, "session-updated").await;
    assert_eq!(update["workspace"], "kazomi");
    assert_eq!(update["status"], "thinking");
    assert_eq!(update["session"]["id"], session.as_str());
    assert_eq!(update["session"]["status"], "thinking");

    let after = drain_types(&mut ws, Duration::from_millis(400)).await;
    assert!(
        !after.iter().any(|ty| ty == "workspace-list"),
        "the whole list was resent for a one-session change: {after:?}"
    );
}

#[tokio::test]
#[serial_test::serial]
async fn a_client_that_skips_the_hello_is_told_to_update_and_served_nothing() {
    let daemon = Daemon::start().await;
    let mut ws = daemon.open().await;

    send(&mut ws, json!({ "type": "list-workspaces" })).await;
    send(&mut ws, json!({ "type": "ping", "nonce": 1 })).await;
    assert_eq!(
        drain_types(&mut ws, Duration::from_millis(400)).await,
        vec!["incompatible"]
    );

    // Saying hello after all is enough to be served.
    send(
        &mut ws,
        json!({ "type": "hello", "protocol": PROTOCOL_VERSION, "clientId": "late" }),
    )
    .await;
    read_until(&mut ws, "welcome").await;
    send(&mut ws, json!({ "type": "ping", "nonce": 2 })).await;
    assert_eq!(read_until(&mut ws, "pong").await["nonce"], 2);
}

#[tokio::test]
#[serial_test::serial]
async fn a_resize_reaches_the_pty() {
    let daemon = Daemon::start().await;
    let mut ws = daemon.connect().await;
    let session = daemon.create_space(&mut ws, "/bin/sh").await;
    send(&mut ws, json!({ "type": "attach", "session": session })).await;
    let slot = read_until(&mut ws, "attached").await["slot"]
        .as_u64()
        .expect("slot") as u16;

    send(
        &mut ws,
        json!({ "type": "resize", "session": session, "cols": 120, "rows": 40 }),
    )
    .await;
    // Give the shell a moment to receive SIGWINCH before it runs the command.
    tokio::time::sleep(Duration::from_millis(200)).await;
    send(
        &mut ws,
        json!({ "type": "input", "session": session, "data": "stty size\n" }),
    )
    .await;

    // `stty size` prints "<rows> <cols>".
    assert!(
        terminal_contains(&mut ws, slot, "40 120").await,
        "the PTY did not report the resized dimensions"
    );
}

#[tokio::test]
#[serial_test::serial]
async fn a_second_client_watches_read_only_until_it_takes_control() {
    let daemon = Daemon::start().await;
    let mut driver = daemon.connect().await;
    let session = daemon.create_space(&mut driver, "/bin/cat").await;
    send(&mut driver, json!({ "type": "attach", "session": session })).await;
    let slot = read_until(&mut driver, "attached").await["slot"]
        .as_u64()
        .expect("slot") as u16;
    send(
        &mut driver,
        json!({ "type": "resize", "session": session, "cols": 90, "rows": 20 }),
    )
    .await;
    let size = read_until(&mut driver, "terminal-size").await;
    // The first size is the one the terminal started at; the resize follows.
    let size = if size["cols"] == 90 {
        size
    } else {
        read_until(&mut driver, "terminal-size").await
    };
    assert_eq!(
        (size["cols"].as_u64(), size["rows"].as_u64()),
        (Some(90), Some(20))
    );

    // A second client arrives. It is not in control, and is told the terminal's size before any
    // output, so it can show the terminal as the one in control has it.
    let mut watcher = daemon.connect().await;
    send(&mut watcher, json!({ "type": "list-workspaces" })).await;
    let control = read_until(&mut watcher, "control").await;
    assert!(
        control["holder"].is_string(),
        "the watcher is not in control"
    );
    send(
        &mut watcher,
        json!({ "type": "attach", "session": session }),
    )
    .await;
    let watcher_slot = read_until(&mut watcher, "attached").await["slot"]
        .as_u64()
        .expect("slot") as u16;
    let size = read_until(&mut watcher, "terminal-size").await;
    assert_eq!(
        (size["cols"].as_u64(), size["rows"].as_u64()),
        (Some(90), Some(20))
    );
    assert!(terminal_contains(&mut watcher, watcher_slot, "\u{1b}c").await);

    // What it types and the size of its own pane change nothing.
    send(
        &mut watcher,
        json!({ "type": "resize", "session": session, "cols": 40, "rows": 10 }),
    )
    .await;
    send(
        &mut watcher,
        json!({ "type": "input", "session": session, "data": "from the watcher\n" }),
    )
    .await;
    let seen = drain_types(&mut watcher, Duration::from_millis(400)).await;
    assert!(!seen.iter().any(|ty| ty == "terminal-size"), "got {seen:?}");

    // It sees what the one in control does, live.
    send(
        &mut driver,
        json!({ "type": "input", "session": session, "data": "from the driver\n" }),
    )
    .await;
    assert!(terminal_contains(&mut watcher, watcher_slot, "from the driver").await);
    assert!(terminal_contains(&mut driver, slot, "from the driver").await);

    // Taking control is explicit; from then on its size and input apply, and the other is told.
    send(&mut watcher, json!({ "type": "take-control" })).await;
    let control = read_until(&mut watcher, "control").await;
    assert!(control["holder"].is_null(), "the watcher is now in control");
    assert!(read_until(&mut driver, "control").await["holder"].is_string());
    send(
        &mut watcher,
        json!({ "type": "resize", "session": session, "cols": 40, "rows": 10 }),
    )
    .await;
    let size = read_until(&mut driver, "terminal-size").await;
    assert_eq!(
        (size["cols"].as_u64(), size["rows"].as_u64()),
        (Some(40), Some(10))
    );
    send(
        &mut watcher,
        json!({ "type": "input", "session": session, "data": "now it counts\n" }),
    )
    .await;
    assert!(terminal_contains(&mut driver, slot, "now it counts").await);
}

#[tokio::test]
#[serial_test::serial]
async fn a_client_that_comes_back_with_its_chat_cursor_is_not_sent_the_chat_again() {
    let daemon = Daemon::start().await;
    let mut ws = daemon.connect().await;
    let session = daemon.create_space(&mut ws, "/bin/cat").await;

    // A first attach has nothing to go on: the chat starts over, and says where it stands.
    send(&mut ws, json!({ "type": "attach", "session": session })).await;
    let reset = read_until(&mut ws, "chat-reset").await;
    let cursor = json!({ "log": reset["log"], "seq": reset["seq"] });
    assert!(reset["log"].as_str().is_some_and(|log| !log.is_empty()));
    drain_types(&mut ws, Duration::from_millis(300)).await;

    // Attaching again with that cursor keeps the chat the client holds.
    send(
        &mut ws,
        json!({ "type": "attach", "session": session, "chat": cursor }),
    )
    .await;
    let seen = drain_types(&mut ws, Duration::from_millis(400)).await;
    assert!(seen.iter().any(|ty| ty == "chat-resumed"), "got {seen:?}");
    assert!(!seen.iter().any(|ty| ty == "chat-reset"), "got {seen:?}");

    // A cursor into a log this daemon does not have starts it over.
    send(
        &mut ws,
        json!({ "type": "attach", "session": session, "chat": { "log": "gone", "seq": 3 } }),
    )
    .await;
    assert_eq!(read_until(&mut ws, "chat-reset").await["log"], reset["log"]);
}

#[tokio::test]
#[serial_test::serial]
async fn a_directory_change_goes_only_to_clients_that_listed_it() {
    let daemon = Daemon::start().await;
    let mut watching = daemon.connect().await;
    daemon.create_space(&mut watching, "/bin/cat").await;
    let mut other = daemon.connect().await;

    send(
        &mut watching,
        json!({ "type": "list-dir", "workspace": "kazomi", "path": "" }),
    )
    .await;
    read_until(&mut watching, "dir-listing").await;
    drain_types(&mut other, Duration::from_millis(300)).await;

    std::fs::write(daemon.root.join("new.txt"), "hello").unwrap();

    let listing = read_until(&mut watching, "dir-listing").await;
    assert!(
        listing["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["name"] == "new.txt")
    );
    let seen = drain_types(&mut other, Duration::from_millis(500)).await;
    assert!(
        !seen.iter().any(|ty| ty == "dir-listing"),
        "a client that never listed the directory was sent its listing: {seen:?}"
    );
}
