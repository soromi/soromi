//! A viewport that is following a chat keeps following it when the session's agent is started
//! over. The agent is restarted whenever its workspace's folders or accounts change; a viewport
//! left listening to the old process showed nothing of what was said from then on.

use std::os::unix::fs::PermissionsExt;
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
use soromi_daemon::pairing::{DirectSettings, PairingService};
use soromi_daemon::sound::player::NoopSoundPlayer;
use soromi_daemon::transport::server::serve;
use soromi_daemon::workspaces::service::WorkspaceService;
use soromi_protocol::{KeepAwakeMode, PROTOCOL_VERSION};

/// What the local link takes from a client here (`transport::local`).
const TOKEN: &str = "test-local-token";

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn say(ws: &mut Socket, value: Value) {
    ws.send(Message::Text(value.to_string())).await.unwrap();
}

/// The next message for which `wanted` holds, or `None` if three seconds pass first.
async fn hear(ws: &mut Socket, wanted: impl Fn(&Value) -> bool) -> Option<Value> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    loop {
        let frame = tokio::time::timeout_at(deadline, ws.next()).await.ok()??;
        if let Ok(Message::Text(text)) = frame
            && let Ok(value) = serde_json::from_str::<Value>(&text)
            && wanted(&value)
        {
            return Some(value);
        }
    }
}

fn is(ty: &'static str) -> impl Fn(&Value) -> bool {
    move |value| value["type"] == ty
}

/// Whether a message is the chat event carrying what the user said.
fn says(text: &'static str) -> impl Fn(&Value) -> bool {
    move |value| {
        value["type"] == "chat"
            && value["events"]
                .as_array()
                .is_some_and(|events| events.iter().any(|event| event["text"] == text))
    }
}

#[tokio::test]
#[serial_test::serial]
async fn a_chat_stays_followed_when_its_agent_is_started_over() {
    let home = tempfile::tempdir().unwrap();
    soromi_daemon::home::set_soromi_home(Some(home.path().to_path_buf()));
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("api")).unwrap();
    // In place of the agent: something that takes what it is sent and says nothing.
    let bin = tempfile::tempdir().unwrap();
    let agent = bin.path().join("claude");
    std::fs::write(&agent, "#!/bin/sh\ncat > /dev/null\n").unwrap();
    std::fs::set_permissions(&agent, std::fs::Permissions::from_mode(0o755)).unwrap();
    let path = format!("{}:/usr/bin:/bin", bin.path().display());

    let notifications = Arc::new(NotificationController::new(Arc::new(NoopNotifier)));
    let keep_awake = Arc::new(KeepAwakeController::new(
        Arc::new(NoopKeepAwake),
        KeepAwakeMode::Off,
    ));
    let hub = WorkspaceService::new(
        notifications,
        keep_awake,
        Arc::new(NoopSoundPlayer),
        Some(path),
    );
    let accounts = Arc::new(FileAccountManager);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let pairing = PairingService::new(
        hub.clone(),
        accounts.clone(),
        "ws://127.0.0.1:9".to_string(),
        "soromi".to_string(),
        DirectSettings {
            enabled: false,
            port: 0,
        },
    );
    tokio::spawn(serve(
        listener,
        hub.clone(),
        accounts,
        pairing,
        TOKEN.into(),
    ));

    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/?token={TOKEN}"))
        .await
        .unwrap();
    say(
        &mut ws,
        json!({ "type": "hello", "protocol": PROTOCOL_VERSION, "clientId": "desk" }),
    )
    .await;
    hear(&mut ws, is("welcome")).await.expect("a welcome");
    say(
        &mut ws,
        json!({
            "type": "create-space", "name": "kazomi", "root": root.path().to_string_lossy(),
            "agent": "claude", "account": "personal"
        }),
    )
    .await;
    hear(&mut ws, is("workspace-opened"))
        .await
        .expect("a workspace");
    say(
        &mut ws,
        json!({
            "type": "open-session", "workspace": "kazomi", "agent": "claude",
            "account": "personal", "mode": "chat"
        }),
    )
    .await;
    let opened = hear(&mut ws, is("session-opened")).await.expect("a chat");
    let session = opened["session"]["id"].as_str().unwrap().to_string();

    say(&mut ws, json!({ "type": "attach", "session": session })).await;
    hear(&mut ws, is("chat-reset"))
        .await
        .expect("the chat as it stands");
    say(
        &mut ws,
        json!({ "type": "chat-turn", "session": session, "text": "before", "files": [] }),
    )
    .await;
    assert!(hear(&mut ws, says("before")).await.is_some());

    // Saving the workspace with other folders starts every agent in it over.
    say(
        &mut ws,
        json!({
            "type": "update-space", "workspace": "kazomi",
            "accounts": [{ "id": "personal", "agent": "claude" }], "folders": ["api"]
        }),
    )
    .await;
    // The viewport is put on the new process without asking, and starts the conversation afresh.
    hear(&mut ws, is("chat-reset"))
        .await
        .expect("the chat afresh");

    say(
        &mut ws,
        json!({ "type": "chat-turn", "session": session, "text": "after", "files": [] }),
    )
    .await;
    assert!(
        hear(&mut ws, says("after")).await.is_some(),
        "what is said after the restart is shown"
    );

    soromi_daemon::home::set_soromi_home(None);
}
