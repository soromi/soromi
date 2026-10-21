//! The direct route: a listener paired devices connect to straight over a network they share with
//! this computer (the same Wi-Fi, a VPN), in place of the relay.
//!
//! It speaks the relay link's encrypted frames, with the device's own key. The socket itself is
//! open to anyone who can reach the port, so it is held to the same rule as the relay link and one
//! more: a socket must name a paired device to be let in, and counts for nothing until it sends a
//! frame sealed with that device's key.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Semaphore, watch};
use tokio::task::AbortHandle;
use tokio_tungstenite::accept_hdr_async_with_config;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;

use super::codec::Codec;
use super::server::{DeviceLink, Link, PresenceSink, handle_connection};
use crate::accounts::store::FileAccountManager;
use crate::workspaces::service::WorkspaceService;

/// How many sockets may be in the opening handshake at once. One past that is dropped unanswered,
/// so a flood of half-open sockets cannot tie the daemon up.
const MAX_OPENING: usize = 16;

/// How many sockets one device may hold at once. A phone uses one, and two for a moment while it
/// moves between networks; more than a few is someone replaying its id.
const MAX_PER_DEVICE: usize = 4;

/// How long a socket has to finish the WebSocket handshake.
const HANDSHAKE_LIMIT: Duration = Duration::from_secs(5);

/// The largest frame accepted. A message with attachments is a few megabytes; nothing is larger.
const MAX_FRAME: usize = 8 * 1024 * 1024;

/// How often this computer's addresses are read again: it joins and leaves networks.
const ADDRESS_CHECK: Duration = Duration::from_secs(10);

/// The most addresses told to a device. It tries every one, so the list stays short.
const MAX_ROUTES: usize = 6;

/// What the listener needs to know of a paired device to let it in.
pub(crate) struct Admission {
    /// The device's key, base64.
    pub key: String,
    /// The device's name, shown on the desktop while it is in control.
    pub name: String,
    /// Told whether this socket's device is there.
    pub on_presence: PresenceSink,
}

/// Looks a device up by the id a socket named; `None` for one that is not paired.
pub(crate) type Admit = Arc<dyn Fn(&str) -> Option<Admission> + Send + Sync>;

/// The direct route, on or off. While on it listens on the network and keeps the addresses a device
/// can reach it at; while off it holds no port and the addresses are empty.
pub(crate) struct DirectAccess {
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    admit: Admit,
    /// The port to listen on; 0 lets the system pick one.
    port: u16,
    routes: watch::Sender<Vec<String>>,
    /// The port actually bound while listening.
    bound: watch::Sender<Option<u16>>,
    /// The listening task, while on.
    task: Mutex<Option<AbortHandle>>,
    sockets: Arc<Mutex<Sockets>>,
}

/// The sockets that came in through the listener, and whether more are taken.
#[derive(Default)]
struct Sockets {
    /// Whether the route is on. A socket that was mid-handshake when it was turned off finds this
    /// false when it is done, and is dropped instead of outliving the switch.
    open: bool,
    /// device id -> its live sockets, so revoking a device or turning the route off drops them.
    by_device: HashMap<String, Vec<AbortHandle>>,
}

impl DirectAccess {
    pub fn new(
        hub: Arc<WorkspaceService>,
        accounts: Arc<FileAccountManager>,
        admit: Admit,
        port: u16,
    ) -> Self {
        Self {
            hub,
            accounts,
            admit,
            port,
            routes: watch::channel(Vec::new()).0,
            bound: watch::channel(None).0,
            task: Mutex::new(None),
            sockets: Arc::new(Mutex::new(Sockets::default())),
        }
    }

    /// The addresses a device can reach this computer at, kept current. Empty while off.
    pub fn routes(&self) -> watch::Receiver<Vec<String>> {
        self.routes.subscribe()
    }

    /// The port being listened on, `None` while off or not yet bound.
    pub fn bound(&self) -> watch::Receiver<Option<u16>> {
        self.bound.subscribe()
    }

    /// Turns the route on or off. Turning it off closes the port, drops every socket that came in
    /// through it, and tells devices there is no direct route any more. Must run within a runtime.
    pub fn set_enabled(&self, enabled: bool) {
        let mut task = self.task.lock().unwrap();
        if enabled == task.is_some() {
            return;
        }
        if let Some(task) = task.take() {
            task.abort();
            {
                let mut sockets = self.sockets.lock().unwrap();
                sockets.open = false;
                for (_, held) in sockets.by_device.drain() {
                    for socket in held {
                        socket.abort();
                    }
                }
            }
            self.bound.send_replace(None);
            self.routes.send_replace(Vec::new());
            return;
        }

        self.sockets.lock().unwrap().open = true;
        let listening = listen(
            self.port,
            Arc::new(Entry {
                hub: self.hub.clone(),
                accounts: self.accounts.clone(),
                admit: self.admit.clone(),
                routes: self.routes.subscribe(),
                sockets: self.sockets.clone(),
            }),
            self.routes.clone(),
            self.bound.clone(),
        );
        *task = Some(tokio::spawn(listening).abort_handle());
    }

    /// Drops a device's sockets: it was revoked.
    pub fn drop_device(&self, id: &str) {
        if let Some(sockets) = self.sockets.lock().unwrap().by_device.remove(id) {
            for socket in sockets {
                socket.abort();
            }
        }
    }
}

impl Drop for DirectAccess {
    fn drop(&mut self) {
        if let Some(task) = self.task.lock().unwrap().take() {
            task.abort();
        }
    }
}

/// What every accepted socket is handled with.
struct Entry {
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    admit: Admit,
    routes: watch::Receiver<Vec<String>>,
    sockets: Arc<Mutex<Sockets>>,
}

/// Binds the port and serves it until aborted, keeping the routes current meanwhile.
async fn listen(
    port: u16,
    entry: Arc<Entry>,
    routes: watch::Sender<Vec<String>>,
    bound: watch::Sender<Option<u16>>,
) {
    let Some(listener) = bind(port).await else {
        eprintln!("soromi: could not open a port for direct connections; devices use the relay");
        return;
    };
    let Ok(port) = listener.local_addr().map(|addr| addr.port()) else {
        return;
    };
    println!("soromi: paired devices can connect directly on port {port}");
    bound.send_replace(Some(port));

    let opening = Arc::new(Semaphore::new(MAX_OPENING));
    let mut check = tokio::time::interval(ADDRESS_CHECK);
    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let Ok((stream, _)) = accepted else {
                    // Out of file descriptors, most likely: do not spin on it.
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    continue;
                };
                let Ok(permit) = opening.clone().try_acquire_owned() else {
                    continue;
                };
                let entry = entry.clone();
                tokio::spawn(async move {
                    let admitted = tokio::time::timeout(HANDSHAKE_LIMIT, open(stream, &entry)).await;
                    drop(permit);
                    if let Ok(Some(socket)) = admitted {
                        socket.run(&entry);
                    }
                });
            }
            _ = check.tick() => {
                let current = routes_for(&local_addresses(), port);
                routes.send_if_modified(|routes| {
                    let changed = *routes != current;
                    if changed {
                        *routes = current;
                    }
                    changed
                });
            }
        }
    }
}

/// Binds the wanted port on every interface, or any free one if it is taken (a second daemon, a
/// stale one still shutting down): a device is told the port, so it need not be the usual one.
async fn bind(port: u16) -> Option<TcpListener> {
    if let Ok(listener) = TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await {
        return Some(listener);
    }
    if port == 0 {
        return None;
    }
    TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)).await.ok()
}

/// A socket that finished its handshake and named a paired device.
struct Admitted {
    ws: tokio_tungstenite::WebSocketStream<TcpStream>,
    device: String,
    admission: Admission,
    codec: Codec,
}

/// Finishes a socket's WebSocket handshake, refusing one that does not name a paired device.
async fn open(stream: TcpStream, entry: &Entry) -> Option<Admitted> {
    // A keystroke and its echo are tiny packets; never hold one back to batch it.
    let _ = stream.set_nodelay(true);

    let mut found: Option<(String, Admission)> = None;
    let admit = entry.admit.clone();
    // The error type is the handshake's own; it is built once per refused socket.
    #[allow(clippy::result_large_err)]
    let check = |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
        let device = device_param(request.uri().query());
        match device.and_then(|device| admit(&device).map(|admission| (device, admission))) {
            Some(admitted) => {
                found = Some(admitted);
                Ok(response)
            }
            // Says nothing of why: an unknown device and a malformed request look the same.
            None => {
                let mut refusal = ErrorResponse::new(None);
                *refusal.status_mut() = StatusCode::NOT_FOUND;
                Err(refusal)
            }
        }
    };
    let config = WebSocketConfig {
        max_message_size: Some(MAX_FRAME),
        max_frame_size: Some(MAX_FRAME),
        ..WebSocketConfig::default()
    };
    let ws = accept_hdr_async_with_config(stream, check, Some(config))
        .await
        .ok()?;
    let (device, admission) = found?;
    let codec = Codec::from_key_base64(&admission.key)?;

    Some(Admitted {
        ws,
        device,
        admission,
        codec,
    })
}

impl Admitted {
    /// Runs the socket as one of its device's links, unless the device already holds too many.
    fn run(self, entry: &Entry) {
        let mut sockets = entry.sockets.lock().unwrap();
        if !sockets.open {
            return;
        }
        let held = sockets.by_device.entry(self.device.clone()).or_default();
        held.retain(|socket| !socket.is_finished());
        if held.len() >= MAX_PER_DEVICE {
            return;
        }

        let presence = Presence::new(self.admission.on_presence);
        let link = Link::Direct(DeviceLink {
            id: self.device,
            on_presence: presence.sink(),
            routes: entry.routes.clone(),
        });
        let (hub, accounts) = (entry.hub.clone(), entry.accounts.clone());
        let (ws, codec, name) = (self.ws, self.codec, self.admission.name);
        let task = tokio::spawn(async move {
            // Dropped when the socket ends, however it ends: the device is no longer on it.
            let _presence = presence;
            handle_connection(ws, hub, accounts, codec, None, link, name).await;
        });
        held.push(task.abort_handle());
    }
}

/// One socket's say in whether its device is there: reported at most once each way, and taken back
/// when the socket goes, so the count of a device's live sockets never drifts.
struct Presence {
    on: Arc<AtomicBool>,
    report: PresenceSink,
}

impl Presence {
    fn new(report: PresenceSink) -> Self {
        Self {
            on: Arc::new(AtomicBool::new(false)),
            report,
        }
    }

    fn sink(&self) -> PresenceSink {
        let (on, report) = (self.on.clone(), self.report.clone());
        Arc::new(move |present| {
            if on.swap(present, Ordering::SeqCst) != present {
                report(present);
            }
        })
    }
}

impl Drop for Presence {
    fn drop(&mut self) {
        if self.on.swap(false, Ordering::SeqCst) {
            (self.report)(false);
        }
    }
}

/// The device id a socket named in its request (`/?device=<id>`).
fn device_param(query: Option<&str>) -> Option<String> {
    query?
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(name, _)| *name == "device")
        .map(|(_, value)| value.to_string())
        .filter(|value| !value.is_empty())
}

/// This computer's addresses on its networks, as the system lists them.
fn local_addresses() -> Vec<Ipv4Addr> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(address) => Some(address),
            IpAddr::V6(_) => None,
        })
        .collect()
}

/// Whether a device on the same network could reach this address: a private one (home and office
/// networks), or one from the shared range VPNs such as Tailscale hand out. Never a public address:
/// that would be telling a phone to cross the internet unrelayed, to a port that is rarely open.
fn is_reachable(address: &Ipv4Addr) -> bool {
    let shared = address.octets()[0] == 100 && (address.octets()[1] & 0xc0) == 64;

    (address.is_private() || shared) && !address.is_loopback() && !address.is_link_local()
}

/// The routes to tell a device, from this computer's addresses: one WebSocket address each, home
/// and office networks before VPNs, and no more than a device should have to try.
fn routes_for(addresses: &[Ipv4Addr], port: u16) -> Vec<String> {
    let mut reachable: Vec<Ipv4Addr> = addresses.iter().copied().filter(is_reachable).collect();
    reachable.sort_by_key(|address| (!address.is_private(), *address));
    reachable.dedup();

    reachable
        .into_iter()
        .take(MAX_ROUTES)
        .map(|address| format!("ws://{address}:{port}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_socket_names_its_device_in_the_query() {
        assert_eq!(device_param(Some("device=abc")), Some("abc".to_string()));
        assert_eq!(
            device_param(Some("x=1&device=abc")),
            Some("abc".to_string())
        );
        assert_eq!(device_param(Some("device=")), None);
        assert_eq!(device_param(Some("room=abc")), None);
        assert_eq!(device_param(None), None);
    }

    #[test]
    fn only_addresses_a_nearby_device_could_reach_become_routes() {
        let addresses = [
            Ipv4Addr::new(127, 0, 0, 1),
            Ipv4Addr::new(100, 101, 102, 103),
            Ipv4Addr::new(192, 168, 1, 20),
            Ipv4Addr::new(169, 254, 10, 1),
            Ipv4Addr::new(8, 8, 8, 8),
            Ipv4Addr::new(10, 0, 0, 5),
            Ipv4Addr::new(192, 168, 1, 20),
            // Just outside the shared range.
            Ipv4Addr::new(100, 128, 0, 1),
        ];

        assert_eq!(
            routes_for(&addresses, 8318),
            vec![
                "ws://10.0.0.5:8318",
                "ws://192.168.1.20:8318",
                "ws://100.101.102.103:8318",
            ]
        );
    }

    #[test]
    fn a_device_is_told_only_a_few_routes() {
        let addresses: Vec<Ipv4Addr> = (1..=20).map(|n| Ipv4Addr::new(10, 0, 0, n)).collect();

        assert_eq!(routes_for(&addresses, 1).len(), MAX_ROUTES);
    }

    #[test]
    fn a_socket_reports_its_device_once_and_takes_it_back_when_it_goes() {
        let count = Arc::new(Mutex::new(0i32));
        let counted = count.clone();
        let presence = Presence::new(Arc::new(move |present| {
            *counted.lock().unwrap() += if present { 1 } else { -1 };
        }));
        let sink = presence.sink();

        sink(true);
        sink(true);
        assert_eq!(*count.lock().unwrap(), 1);

        drop(presence);
        assert_eq!(*count.lock().unwrap(), 0);
        // Nothing more to take back.
        sink(false);
        assert_eq!(*count.lock().unwrap(), 0);
    }
}
