//! Drives the real WebSocket server the way the GUI does: create a space, list it, attach, and
//! exchange terminal I/O. Proves the Rust daemon serves the same wire protocol as the Node one.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, Stream, StreamExt};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::{Error, Message};

use soromi_daemon::accounts::store::FileAccountManager;
use soromi_daemon::keep_awake::backend::NoopKeepAwake;
use soromi_daemon::keep_awake::controller::KeepAwakeController;
use soromi_daemon::notifications::controller::NotificationController;
use soromi_daemon::notifications::notifier::NoopNotifier;
use soromi_daemon::transport::server::serve;
use soromi_daemon::workspaces::service::WorkspaceService;
use soromi_protocol::KeepAwakeMode;

async fn next_json<S>(ws: &mut S) -> Value
where
    S: Stream<Item = Result<Message, Error>> + Unpin,
{
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), ws.next())
            .await
            .expect("timed out waiting for a message")
            .expect("stream ended")
            .expect("websocket error");
        if let Message::Text(text) = message {
            return serde_json::from_str(&text).expect("valid json");
        }
    }
}

async fn read_until<S>(ws: &mut S, ty: &str) -> Value
where
    S: Stream<Item = Result<Message, Error>> + Unpin,
{
    loop {
        let value = next_json(ws).await;
        if value["type"] == ty {
            return value;
        }
    }
}

#[tokio::test]
#[serial_test::serial]
async fn gui_can_create_list_attach_and_exchange_io() {
    let home = tempfile::tempdir().unwrap();
    std::env::set_var("SOROMI_HOME", home.path());
    let root = tempfile::tempdir().unwrap();

    let notifications = Arc::new(NotificationController::new(Arc::new(NoopNotifier)));
    let keep_awake = Arc::new(KeepAwakeController::new(
        Arc::new(NoopKeepAwake),
        KeepAwakeMode::Off,
    ));
    let hub = WorkspaceService::new(notifications, keep_awake);
    let accounts = Arc::new(FileAccountManager);

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(serve(listener, hub, accounts));

    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}"))
        .await
        .unwrap();

    // Create a space backed by a trivial PTY program.
    ws.send(Message::Text(
        json!({
            "type": "create-space",
            "name": "kazomi",
            "root": root.path().to_string_lossy(),
            "agent": "/bin/cat",
            "account": "personal"
        })
        .to_string(),
    ))
    .await
    .unwrap();
    let opened = read_until(&mut ws, "workspace-opened").await;
    assert_eq!(opened["workspace"], "kazomi");

    // List workspaces.
    ws.send(Message::Text(
        json!({ "type": "list-workspaces" }).to_string(),
    ))
    .await
    .unwrap();
    let list = read_until(&mut ws, "workspace-list").await;
    assert_eq!(list["workspaces"][0]["name"], "kazomi");
    assert_eq!(list["workspaces"][0]["agent"], "/bin/cat");

    // Attach, then exchange terminal I/O (cat echoes input in a PTY).
    ws.send(Message::Text(
        json!({ "type": "attach", "workspace": "kazomi" }).to_string(),
    ))
    .await
    .unwrap();
    ws.send(Message::Text(
        json!({ "type": "input", "workspace": "kazomi", "data": "ping\n" }).to_string(),
    ))
    .await
    .unwrap();

    let echoed = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let value = next_json(&mut ws).await;
            if value["type"] == "output"
                && value["data"].as_str().is_some_and(|d| d.contains("ping"))
            {
                break true;
            }
        }
    })
    .await
    .unwrap_or(false);
    assert!(echoed, "did not receive echoed terminal output");

    std::env::remove_var("SOROMI_HOME");
}
