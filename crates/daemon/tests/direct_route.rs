//! Drives the direct route the way a paired phone does: a socket opened straight to the daemon,
//! speaking the relay link's encrypted frames with the device's own key. Pins who is let in, what
//! a socket without the key is served (nothing), and that control follows the device from one of
//! its links to the next.

use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use soromi_daemon::accounts::store::FileAccountManager;
use soromi_daemon::keep_awake::backend::NoopKeepAwake;
use soromi_daemon::keep_awake::controller::KeepAwakeController;
use soromi_daemon::notifications::controller::{
    DEBOUNCE, NotificationController, WireNotification,
};
use soromi_daemon::notifications::notifier::NoopNotifier;
use soromi_daemon::notifications::push::{Delivery, PushGateway, PushService, Sending};
use soromi_daemon::pairing::{DirectSettings, PairingService};
use soromi_daemon::sound::player::{Cue, NoopSoundPlayer};
use soromi_daemon::transport::codec::{Codec, Received};
use soromi_daemon::transport::server::serve;
use soromi_daemon::workspaces::service::WorkspaceService;
use soromi_protocol::{DeviceRoute, KeepAwakeMode, PROTOCOL_VERSION};

/// What the local link takes from a client here (`transport::local`).
const TOKEN: &str = "test-local-token";

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// A key no device was paired with.
const OTHER_KEY: &str = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";

/// A token of the kind the push service hands a phone.
const PUSH_TOKEN: &str = "ExponentPushToken[test]";

/// Stands in for the push service: keeps what it was asked to send, and sends nothing.
#[derive(Default)]
struct Pushed {
    banners: std::sync::Mutex<Vec<(String, String)>>,
}

impl Pushed {
    /// The `(token, body)` of each banner pushed so far.
    fn banners(&self) -> Vec<(String, String)> {
        self.banners.lock().unwrap().clone()
    }
}

impl PushGateway for Pushed {
    fn send(&self, token: &str, _device: &str, banner: &WireNotification) -> Sending {
        self.banners
            .lock()
            .unwrap()
            .push((token.to_string(), banner.body.clone()));
        Box::pin(async { Delivery::Sent })
    }
}

/// A daemon with one paired device, its direct listener on a free port, and its own temporary home.
struct Daemon {
    hub: Arc<WorkspaceService>,
    pairing: Arc<PairingService>,
    /// Where the desktop app connects.
    local: std::net::SocketAddr,
    /// The port devices connect to directly.
    port: u16,
    device: String,
    key: String,
    /// What the daemon handed to the push service.
    pushed: Arc<Pushed>,
    _home: tempfile::TempDir,
}

impl Daemon {
    async fn start() -> Self {
        let home = tempfile::tempdir().unwrap();
        soromi_daemon::home::set_soromi_home(Some(home.path().to_path_buf()));

        let pushed = Arc::new(Pushed::default());
        let notifications = Arc::new(NotificationController::with_push(
            Arc::new(NoopNotifier),
            DEBOUNCE,
            Arc::new(PushService::new(pushed.clone(), None)),
        ));
        let keep_awake = Arc::new(KeepAwakeController::new(
            Arc::new(NoopKeepAwake),
            KeepAwakeMode::Off,
        ));
        let hub = WorkspaceService::new(notifications, keep_awake, Arc::new(NoopSoundPlayer), None);
        let accounts = Arc::new(FileAccountManager);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let local = listener.local_addr().unwrap();
        // Nothing listens at this relay: the device's relay link just keeps failing to dial.
        let pairing = PairingService::new(
            hub.clone(),
            accounts.clone(),
            "ws://127.0.0.1:9".to_string(),
            "soromi".to_string(),
            DirectSettings {
                enabled: true,
                port: 0,
            },
        );
        tokio::spawn(serve(
            listener,
            hub.clone(),
            accounts,
            pairing.clone(),
            TOKEN.into(),
        ));

        let paired = pairing.create_device("Phone".to_string());
        let code = paired.pairing_code.strip_prefix("soromi://pair#").unwrap();
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(code)
            .unwrap();
        let payload: Value = serde_json::from_slice(&payload).unwrap();
        let port = pairing
            .direct_port()
            .wait_for(Option::is_some)
            .await
            .unwrap()
            .expect("a port");

        Self {
            hub,
            pairing,
            local,
            port,
            device: paired.id,
            key: payload["key"].as_str().unwrap().to_string(),
            pushed,
            _home: home,
        }
    }

    /// The desktop app's connection, past its handshake.
    async fn desktop(&self) -> Socket {
        let (mut ws, _) =
            tokio_tungstenite::connect_async(format!("ws://{}/?token={TOKEN}", self.local))
                .await
                .unwrap();
        let hello = json!({ "type": "hello", "protocol": PROTOCOL_VERSION, "clientId": "desk" });
        ws.send(Message::Text(hello.to_string())).await.unwrap();
        loop {
            let frame = ws.next().await.unwrap().unwrap();
            if let Message::Text(text) = frame
                && text.contains("\"welcome\"")
            {
                return ws;
            }
        }
    }

    /// How the paired device is connected, as the desktop is told.
    fn route(&self) -> Option<DeviceRoute> {
        self.pairing.list_devices()[0].route
    }
}

impl Drop for Daemon {
    fn drop(&mut self) {
        soromi_daemon::home::set_soromi_home(None);
    }
}

/// A phone's end of a direct socket.
struct Phone {
    ws: Socket,
    codec: Codec,
}

impl Phone {
    /// Opens a socket naming `device`, and agrees a session with whatever key the phone holds.
    async fn dial(port: u16, device: &str, key: &str) -> Result<Self, String> {
        let url = format!("ws://127.0.0.1:{port}/?device={device}");
        let (ws, _) = tokio_tungstenite::connect_async(url)
            .await
            .map_err(|error| error.to_string())?;
        let mut phone = Self {
            ws,
            codec: Codec::device_from_key_base64(key).expect("a key"),
        };
        let open = phone.codec.open_session().expect("a device opens sessions");
        phone.ws.send(open).await.map_err(|e| e.to_string())?;
        loop {
            let frame = tokio::time::timeout(Duration::from_secs(5), phone.ws.next())
                .await
                .map_err(|_| "no answer to the session request".to_string())?
                .ok_or("the socket ended")?
                .map_err(|e| e.to_string())?;
            if matches!(phone.codec.receive(frame), Received::Accepted) {
                return Ok(phone);
            }
        }
    }

    /// A socket past its session and its hello.
    async fn connect(daemon: &Daemon) -> Self {
        let mut phone = Self::dial(daemon.port, &daemon.device, &daemon.key)
            .await
            .unwrap();
        phone.hello().await;
        phone.hear("welcome").await.expect("a welcome");
        phone
    }

    async fn hello(&mut self) {
        self.say(json!({ "type": "hello", "protocol": PROTOCOL_VERSION, "clientId": "phone" }))
            .await;
    }

    async fn say(&mut self, value: Value) {
        let frame = self
            .codec
            .seal(value.to_string().into_bytes(), true)
            .expect("a session is on");
        self.ws.send(frame).await.unwrap();
    }

    /// The next message of type `ty`, or `None` if two seconds pass or the socket ends first.
    async fn hear(&mut self, ty: &str) -> Option<Value> {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            let frame = tokio::time::timeout_at(deadline, self.ws.next())
                .await
                .ok()??;
            let Received::Payload(payload) = self.codec.receive(frame.ok()?) else {
                continue;
            };
            if let Ok(value) = serde_json::from_slice::<Value>(&payload)
                && value["type"] == ty
            {
                return Some(value);
            }
        }
    }

    /// Whether this link is in control, as the daemon says when asked for the workspace list.
    async fn in_control(&mut self) -> bool {
        self.say(json!({ "type": "list-workspaces" })).await;
        // The answer is the list and then the control state; one pushed earlier may still be
        // waiting ahead of them, and is skipped with everything else before the list.
        self.hear("workspace-list").await.expect("the list");
        self.hear("control").await.expect("a control state")["holder"].is_null()
    }

    /// Whether the daemon has ended the socket, within two seconds.
    async fn ended(&mut self) -> bool {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            match tokio::time::timeout_at(deadline, self.ws.next()).await {
                Err(_) => return false,
                Ok(None | Some(Err(_)) | Some(Ok(Message::Close(_)))) => return true,
                Ok(Some(Ok(_))) => continue,
            }
        }
    }
}

/// The desktop's next message of type `ty`.
async fn desktop_hears(ws: &mut Socket, ty: &str) -> Value {
    loop {
        let frame = tokio::time::timeout(Duration::from_secs(5), ws.next())
            .await
            .expect("an answer")
            .expect("an open socket")
            .unwrap();
        if let Message::Text(text) = frame
            && let Ok(value) = serde_json::from_str::<Value>(&text)
            && value["type"] == ty
        {
            return value;
        }
    }
}

/// Returns once the daemon has dealt with everything the desktop sent so far: it answers a ping
/// after them, in order.
async fn desktop_settles(ws: &mut Socket) {
    static NONCE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
    let nonce = NONCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let ping = json!({ "type": "ping", "nonce": nonce });
    ws.send(Message::Text(ping.to_string())).await.unwrap();
    while desktop_hears(ws, "pong").await["nonce"] != nonce {}
}

/// Polls until `check` holds, for up to two seconds.
async fn eventually(check: impl Fn() -> bool) -> bool {
    for _ in 0..40 {
        if check() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    false
}

#[tokio::test]
#[serial_test::serial]
async fn a_paired_device_is_served_over_a_direct_socket() {
    let daemon = Daemon::start().await;
    assert_eq!(daemon.route(), None);

    let mut phone = Phone::dial(daemon.port, &daemon.device, &daemon.key)
        .await
        .unwrap();
    // A session is not yet proof: nothing says the socket holds the key.
    assert_eq!(daemon.route(), None);

    phone.hello().await;
    let welcome = phone.hear("welcome").await.expect("a welcome");
    assert_eq!(welcome["protocol"], PROTOCOL_VERSION);
    // It is told where else it can reach the daemon, right after the welcome.
    let routes = phone.hear("routes").await.expect("its routes");
    for route in routes["routes"].as_array().expect("a list") {
        let route = route.as_str().unwrap();
        assert!(route.starts_with("ws://"), "{route}");
        assert!(route.ends_with(&format!(":{}", daemon.port)), "{route}");
    }

    phone.say(json!({ "type": "list-workspaces" })).await;
    assert!(phone.hear("workspace-list").await.is_some());
    assert_eq!(daemon.route(), Some(DeviceRoute::Direct));
    // Someone is using this computer from their phone: it is held awake, whatever the mode.
    assert_eq!(daemon.hub.keep_awake_mode(), KeepAwakeMode::Off);
    assert!(daemon.hub.keep_awake_active());

    // When the socket goes, so does the device.
    drop(phone);
    assert!(eventually(|| daemon.route().is_none()).await);
}

#[tokio::test]
#[serial_test::serial]
async fn a_socket_without_the_key_is_served_nothing() {
    let daemon = Daemon::start().await;

    // A device that is not paired is turned away before the socket opens.
    assert!(
        Phone::dial(daemon.port, "nobody", &daemon.key)
            .await
            .is_err()
    );
    let unnamed = tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", daemon.port)).await;
    assert!(unnamed.is_err());

    // Naming a paired device gets a session, which takes no key. Without the key, what is sent in
    // it cannot be read, and nothing comes back.
    let mut stranger = Phone::dial(daemon.port, &daemon.device, OTHER_KEY)
        .await
        .unwrap();
    stranger.hello().await;
    stranger.say(json!({ "type": "list-workspaces" })).await;
    let answer = tokio::time::timeout(Duration::from_millis(500), stranger.ws.next()).await;
    assert!(
        !matches!(answer, Ok(Some(Ok(Message::Binary(_) | Message::Text(_))))),
        "a socket without the key was sent something"
    );
    assert_eq!(daemon.route(), None, "it does not count as the device");

    // And it never held control: the desktop, arriving later, is the first viewport there.
    let mut desktop = daemon.desktop().await;
    let ask = json!({ "type": "list-workspaces" });
    desktop.send(Message::Text(ask.to_string())).await.unwrap();
    loop {
        let Message::Text(text) = desktop.next().await.unwrap().unwrap() else {
            continue;
        };
        let value: Value = serde_json::from_str(&text).unwrap();
        if value["type"] == "control" {
            assert!(value["holder"].is_null(), "the desktop is in control");
            break;
        }
    }
}

#[tokio::test]
#[serial_test::serial]
async fn control_follows_the_device_from_one_link_to_the_next() {
    let daemon = Daemon::start().await;

    // The phone is first in, so it is in control; the desktop, arriving after, watches.
    let mut first = Phone::connect(&daemon).await;
    assert!(first.in_control().await);
    let _desktop = daemon.desktop().await;

    // The phone moves to another link (it changed network). Control goes with it rather than
    // staying behind on the old link, where it would read as "another device is in control".
    let mut second = Phone::connect(&daemon).await;
    assert!(second.in_control().await);
    assert!(!first.in_control().await);

    // The new link goes: control returns to the phone's remaining link, not to the desktop.
    drop(second);
    let mut returned = false;
    for _ in 0..40 {
        if first.in_control().await {
            returned = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(returned, "control went back to the device's other link");
}

#[tokio::test]
#[serial_test::serial]
async fn a_device_that_drops_off_gets_its_control_back() {
    let daemon = Daemon::start().await;
    let mut desktop = daemon.desktop().await;

    // The phone takes control from the desktop, then its only link drops: it walked out of range,
    // or its app was put behind another one.
    let mut phone = Phone::connect(&daemon).await;
    phone.say(json!({ "type": "take-control" })).await;
    assert!(phone.in_control().await);
    drop(phone);
    assert!(eventually(|| daemon.route().is_none()).await);

    // It is back, by whatever route and however long after: still the one driving.
    let mut phone = Phone::connect(&daemon).await;
    assert!(phone.in_control().await);

    // Not so if someone took control while it was away: that was a choice, and it stands.
    drop(phone);
    assert!(eventually(|| daemon.route().is_none()).await);
    let take = json!({ "type": "take-control" });
    desktop.send(Message::Text(take.to_string())).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let mut phone = Phone::connect(&daemon).await;
    assert!(!phone.in_control().await);
}

#[tokio::test]
#[serial_test::serial]
async fn a_device_is_owed_nothing_once_someone_else_has_driven() {
    let daemon = Daemon::start().await;
    let mut desktop = daemon.desktop().await;

    let mut phone = Phone::connect(&daemon).await;
    phone.say(json!({ "type": "take-control" })).await;
    assert!(phone.in_control().await);
    drop(phone);
    assert!(eventually(|| daemon.route().is_none()).await);

    // The desktop was handed control so nothing was left undriven. Its window being there, and
    // sizing its terminals, is not a claim on it.
    let resize = json!({ "type": "resize", "session": "none", "cols": 80, "rows": 24 });
    desktop
        .send(Message::Text(resize.to_string()))
        .await
        .unwrap();
    desktop_settles(&mut desktop).await;
    let mut phone = Phone::connect(&daemon).await;
    assert!(phone.in_control().await);
    drop(phone);
    assert!(eventually(|| daemon.route().is_none()).await);

    // Typing there is: the person is at the computer now, and the phone asks before taking over.
    let input = json!({ "type": "input", "session": "none", "data": "x" });
    desktop
        .send(Message::Text(input.to_string()))
        .await
        .unwrap();
    desktop_settles(&mut desktop).await;
    let mut phone = Phone::connect(&daemon).await;
    assert!(!phone.in_control().await);
}

#[tokio::test]
#[serial_test::serial]
async fn revoking_the_device_or_turning_the_route_off_cuts_the_socket() {
    let daemon = Daemon::start().await;

    // Turned off: the socket ends and the port closes.
    let mut phone = Phone::connect(&daemon).await;
    daemon.pairing.set_direct(false);
    assert!(phone.ended().await);
    assert_eq!(*daemon.pairing.direct_port().borrow(), None);
    assert!(
        TcpStream::connect(("127.0.0.1", daemon.port))
            .await
            .is_err()
    );

    // Turned back on, the device connects again; revoked, it is cut off for good.
    daemon.pairing.set_direct(true);
    let port = daemon
        .pairing
        .direct_port()
        .wait_for(Option::is_some)
        .await
        .unwrap()
        .expect("a port");
    let mut phone = Phone::dial(port, &daemon.device, &daemon.key)
        .await
        .unwrap();
    phone.hello().await;
    assert!(phone.hear("welcome").await.is_some());

    daemon.pairing.revoke_device(&daemon.device);
    assert!(phone.ended().await);
    // With no device left to use it, no port is held open.
    assert_eq!(*daemon.pairing.direct_port().borrow(), None);
}

#[tokio::test]
#[serial_test::serial]
async fn a_device_that_asks_is_told_when_a_task_finishes() {
    let daemon = Daemon::start().await;
    let root = tempfile::tempdir().unwrap();
    let mut desktop = daemon.desktop().await;
    let space = json!({
        "type": "create-space",
        "name": "kazomi",
        "root": root.path().to_string_lossy(),
        "agent": "/bin/cat",
        "account": "personal"
    });
    desktop
        .send(Message::Text(space.to_string()))
        .await
        .unwrap();
    desktop_hears(&mut desktop, "workspace-opened").await;
    let session = daemon.hub.summaries()[0].sessions[0].id.clone();

    let mut phone = Phone::connect(&daemon).await;
    // It has not asked for banners yet: this one is not for it.
    daemon.hub.handle_agent_event(&session, Cue::Request, None);

    phone
        .say(json!({ "type": "notifications-native", "enabled": true }))
        .await;
    // The desktop app is in front, which keeps the computer quiet and says nothing of the phone.
    let focused = json!({ "type": "set-focused", "focused": true });
    desktop
        .send(Message::Text(focused.to_string()))
        .await
        .unwrap();
    // Both have been read once each end has an answer to something sent after.
    desktop_settles(&mut desktop).await;
    phone.say(json!({ "type": "list-workspaces" })).await;
    phone.hear("workspace-list").await.expect("the list");

    daemon
        .hub
        .handle_agent_event(&session, Cue::Complete, Some("claude"));

    let banner = phone.hear("notify").await.expect("a banner");
    assert_eq!(banner["title"], "Soromi");
    assert_eq!(banner["body"], "\"kazomi\" (claude) finished");
    assert_eq!(banner["workspace"], "kazomi");
    assert_eq!(banner["session"], session.as_str());
}

#[tokio::test]
#[serial_test::serial]
async fn a_banner_reaches_a_phone_over_its_link_or_by_push_never_both() {
    let daemon = Daemon::start().await;
    let root = tempfile::tempdir().unwrap();
    let mut desktop = daemon.desktop().await;
    let space = json!({
        "type": "create-space",
        "name": "kazomi",
        "root": root.path().to_string_lossy(),
        "agent": "/bin/cat",
        "account": "personal"
    });
    desktop
        .send(Message::Text(space.to_string()))
        .await
        .unwrap();
    desktop_hears(&mut desktop, "workspace-opened").await;
    let session = daemon.hub.summaries()[0].sessions[0].id.clone();
    let finish = || daemon.hub.handle_agent_event(&session, Cue::Complete, None);
    let body = "\"kazomi\" finished".to_string();

    // The phone's app is open: it asks for banners and says where to push them when it is not.
    let mut phone = Phone::connect(&daemon).await;
    phone
        .say(json!({ "type": "notifications-native", "enabled": true }))
        .await;
    phone
        .say(json!({ "type": "register-push", "token": PUSH_TOKEN }))
        .await;
    phone.say(json!({ "type": "list-workspaces" })).await;
    phone.hear("workspace-list").await.expect("the list");

    // On screen and connected: told over the link, and nothing is pushed.
    finish();
    assert!(phone.hear("notify").await.is_some());
    assert!(daemon.pushed.banners().is_empty());

    // Behind another app, still connected for the moment: pushed, and not sent over the link too.
    phone
        .say(json!({ "type": "set-focused", "focused": false }))
        .await;
    phone.say(json!({ "type": "list-workspaces" })).await;
    phone.hear("workspace-list").await.expect("the list");
    finish();
    assert!(eventually(|| daemon.pushed.banners().len() == 1).await);
    assert_eq!(
        daemon.pushed.banners()[0],
        (PUSH_TOKEN.to_string(), body.clone())
    );
    assert!(phone.hear("notify").await.is_none());

    // Gone altogether: pushed.
    drop(phone);
    assert!(eventually(|| daemon.route().is_none()).await);
    finish();
    assert!(eventually(|| daemon.pushed.banners().len() == 2).await);

    // With someone at the computer, a phone that is put away is left alone.
    let focused = json!({ "type": "set-focused", "focused": true });
    desktop
        .send(Message::Text(focused.to_string()))
        .await
        .unwrap();
    desktop_settles(&mut desktop).await;
    finish();
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(daemon.pushed.banners().len(), 2);

    // A revoked device is pushed nothing more.
    let unfocused = json!({ "type": "set-focused", "focused": false });
    desktop
        .send(Message::Text(unfocused.to_string()))
        .await
        .unwrap();
    desktop_settles(&mut desktop).await;
    daemon.pairing.revoke_device(&daemon.device);
    finish();
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(daemon.pushed.banners().len(), 2);
}
