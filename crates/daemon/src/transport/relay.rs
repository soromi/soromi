use std::sync::Arc;
use std::time::Duration;

use tokio_tungstenite::connect_async;

use super::codec::Codec;
use super::server::{PresenceSink, handle_connection};
use crate::accounts::store::FileAccountManager;
use crate::workspaces::service::WorkspaceService;

const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

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

    spawn(hub, accounts, url, room, key);
}

/// Spawns the reconnecting relay client for a specific relay URL, room, and optional E2EE key
/// (the raw env override). A missing key means plaintext (dev only); an invalid one is refused.
pub fn spawn(
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    url: String,
    room: String,
    key: Option<String>,
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
        None,
    ));
}

/// Spawns a reconnecting relay client for one paired device, returning a handle so revoking the
/// device can stop it. The key is always present (the device minted it).
pub fn spawn_device(
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    url: String,
    room: String,
    key: String,
    on_presence: PresenceSink,
) -> tokio::task::AbortHandle {
    tokio::spawn(connect_loop(
        hub,
        accounts,
        endpoint(&url, &room),
        Some(key),
        Some(on_presence),
    ))
    .abort_handle()
}

/// Dials `endpoint`, runs one viewport connection over it, and reconnects with backoff forever.
/// The relay link is a plain viewport, so it never carries the pairing service (`None`).
async fn connect_loop(
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    endpoint: String,
    key: Option<String>,
    on_presence: Option<PresenceSink>,
) {
    let mut backoff = INITIAL_BACKOFF;
    loop {
        if let Ok((ws, _)) = connect_async(&endpoint).await {
            backoff = INITIAL_BACKOFF;
            // Encrypt when a key is set; otherwise plaintext (dev).
            let codec = match &key {
                Some(k) => Codec::from_key_base64(k).unwrap_or(Codec::Plain),
                None => Codec::Plain,
            };
            // Runs until the relay link drops; then we loop to reconnect and re-register.
            handle_connection(
                ws,
                hub.clone(),
                accounts.clone(),
                codec,
                None,
                on_presence.clone(),
            )
            .await;
        }

        // The link is down, so the phone is not reachable through it: report it disconnected.
        if let Some(sink) = &on_presence {
            sink(false);
        }

        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

/// Builds the room endpoint URL: `<url>/?room=<room>`.
fn endpoint(url: &str, room: &str) -> String {
    format!("{}/?room={}", url.trim_end_matches('/'), room)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_room_endpoint() {
        assert_eq!(
            endpoint("ws://localhost:8787", "abc"),
            "ws://localhost:8787/?room=abc"
        );
        assert_eq!(
            endpoint("ws://localhost:8787/", "abc"),
            "ws://localhost:8787/?room=abc"
        );
    }
}
