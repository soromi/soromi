use std::sync::Arc;
use std::time::Duration;

use tokio_tungstenite::connect_async_with_config;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_tungstenite::tungstenite::http::HeaderValue;

use super::codec::Codec;
use super::server::{CLOSE_REPLACED, DeviceLink, Link, handle_connection};
use crate::accounts::store::FileAccountManager;
use crate::workspaces::service::WorkspaceService;

const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

/// How long to stay away after another socket took this daemon's place in a room. Only something
/// holding the same room and access key can do that, which means a second daemon on the same
/// account; dialing straight back would have the two evict each other in a loop.
const REPLACED_PAUSE: Duration = Duration::from_secs(300);

/// How long one attempt to reach the relay may take. Just after a wake the network is often not up
/// yet, and a dial left to the system's own patience would sit there for over a minute.
const DIAL_LIMIT: Duration = Duration::from_secs(10);

/// The header the daemon carries its relay access key in, so the relay lets it create the room.
const ACCESS_HEADER: &str = "x-soromi-access";

/// Dials the relay (if configured via env) and runs a viewport connection over it, so a phone in
/// the same room can drive this daemon. `SOROMI_RELAY_URL` (e.g. `ws://localhost:8787`) plus
/// `SOROMI_RELAY_ROOM` (a shared secret id) enable it; absent, the daemon is local-only.
/// `SOROMI_RELAY_KEY` (base64 32-byte) end-to-end-encrypts the link; without it the link is
/// plaintext (dev only). Later, the room and key come from device pairing instead of env.
pub fn spawn_from_env(hub: Arc<WorkspaceService>, accounts: Arc<FileAccountManager>) {
    let (Ok(url), Ok(room)) = (
        std::env::var("SOROMI_RELAY_URL"),
        std::env::var("SOROMI_RELAY_ROOM"),
    ) else {
        return;
    };
    if url.is_empty() || room.is_empty() {
        return;
    }

    let key = std::env::var("SOROMI_RELAY_KEY")
        .ok()
        .filter(|k| !k.is_empty());

    spawn(hub, accounts, url, room, key, crate::config::access_key());
}

/// Spawns the reconnecting relay client for a specific relay URL, room, and optional E2EE key
/// (the raw env override). A missing key means plaintext (dev only); an invalid one is refused.
/// `access_key` is presented to the relay so it lets this daemon create the room.
pub fn spawn(
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    url: String,
    room: String,
    key: Option<String>,
    access_key: String,
) {
    // Validate the key up front, so a bad one fails loudly instead of silently sending plaintext.
    if let Some(k) = &key
        && Codec::from_key_base64(k).is_none()
    {
        eprintln!("soromi: SOROMI_RELAY_KEY is not a base64 32-byte key; not dialing the relay");
        return;
    }

    tokio::spawn(connect_loop(
        hub,
        accounts,
        endpoint(&url, &room),
        key,
        access_key,
        Link::Local,
        "Remote device".to_string(),
    ));
}

/// Spawns a reconnecting relay client for one paired device, returning a handle so revoking the
/// device can stop it. The key is always present (the device minted it). `access_key` is presented
/// to the relay to create the room; `name` names it on the desktop while it is in control.
#[allow(clippy::too_many_arguments)]
pub(crate) fn spawn_device(
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    url: String,
    room: String,
    key: String,
    access_key: String,
    device: DeviceLink,
    name: String,
) -> tokio::task::AbortHandle {
    tokio::spawn(connect_loop(
        hub,
        accounts,
        endpoint(&url, &room),
        Some(key),
        access_key,
        Link::Relay(device),
        name,
    ))
    .abort_handle()
}

/// Dials `endpoint`, runs one viewport connection over it, and reconnects with backoff forever.
/// The relay link is a plain viewport, so it never carries the pairing service (`None`). The access
/// key rides in a header, never in the URL, so it stays out of logs and pairing codes.
///
/// A key that is set but unusable ends the link for good: it is never sent in plaintext instead.
async fn connect_loop(
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    endpoint: String,
    key: Option<String>,
    access_key: String,
    link: Link,
    viewer_name: String,
) {
    let mut backoff = INITIAL_BACKOFF;
    // The machine waking from sleep: whatever this loop was doing, it starts over at once (the
    // connection itself ends on a wake, see `handle_connection`).
    let mut wakes = crate::power::wakes();
    loop {
        let Some(codec) = link_codec(key.as_deref()) else {
            eprintln!("soromi: the key for \"{viewer_name}\" is unusable; not dialing the relay");
            return;
        };
        let mut pause = backoff;
        wakes.borrow_and_update();
        // Nagle off: a keystroke and its echo are tiny packets that must not wait to be batched.
        if let Some(request) = build_request(&endpoint, &access_key)
            && let Ok(Ok((ws, _))) =
                tokio::time::timeout(DIAL_LIMIT, connect_async_with_config(request, None, true))
                    .await
        {
            backoff = INITIAL_BACKOFF;
            pause = backoff;
            // Runs until the relay link drops; then we loop to reconnect and re-register.
            let closed = handle_connection(
                ws,
                hub.clone(),
                accounts.clone(),
                codec,
                None,
                link.clone(),
                viewer_name.clone(),
            )
            .await;
            if closed == Some(CLOSE_REPLACED) {
                eprintln!(
                    "soromi: another daemon took over the relay room for \"{viewer_name}\"; \
                     trying again in {}s",
                    REPLACED_PAUSE.as_secs()
                );
                pause = REPLACED_PAUSE;
            }
        }

        // The link is down, so the phone is not reachable through it: report it disconnected.
        if let Link::Relay(device) = &link {
            (device.on_presence)(false);
        }

        // The machine slept while this link was up or being dialed: the phone may be waiting
        // right now, and the machine may sleep again in seconds. Dial at once, from a short delay.
        if wakes.has_changed().unwrap_or(false) {
            backoff = INITIAL_BACKOFF;
            continue;
        }
        tokio::select! {
            _ = tokio::time::sleep(pause) => backoff = (backoff * 2).min(MAX_BACKOFF),
            _ = wakes.changed() => backoff = INITIAL_BACKOFF,
        }
    }
}

/// The codec for a link: encrypted when a key is set, plaintext only when none is (development).
/// `None` when a key is set but is not a usable one.
fn link_codec(key: Option<&str>) -> Option<Codec> {
    match key {
        Some(key) => Codec::from_key_base64(key),
        None => Some(Codec::Plain),
    }
}

/// Builds the relay handshake request for `endpoint`, carrying the access key in the
/// `x-soromi-access` header (kept out of the URL). `None` if the endpoint is not a valid URL.
fn build_request(endpoint: &str, access_key: &str) -> Option<Request> {
    let mut request = endpoint.into_client_request().ok()?;
    if let Ok(value) = HeaderValue::from_str(access_key) {
        request.headers_mut().insert(ACCESS_HEADER, value);
    }

    Some(request)
}

/// Builds the room endpoint URL, joining as the room's host: `<url>/?room=<room>&role=host`.
fn endpoint(url: &str, room: &str) -> String {
    format!("{}/?room={}&role=host", url.trim_end_matches('/'), room)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_room_endpoint() {
        assert_eq!(
            endpoint("ws://localhost:8787", "abc"),
            "ws://localhost:8787/?room=abc&role=host"
        );
        assert_eq!(
            endpoint("ws://localhost:8787/", "abc"),
            "ws://localhost:8787/?room=abc&role=host"
        );
    }

    #[test]
    fn a_bad_key_is_refused_rather_than_sent_in_plaintext() {
        assert!(matches!(link_codec(None), Some(Codec::Plain)));
        assert!(matches!(
            link_codec(Some("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=")),
            Some(Codec::Encrypted(_))
        ));
        assert!(link_codec(Some("not a key")).is_none());
        assert!(link_codec(Some("")).is_none());
    }
}
