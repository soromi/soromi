use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use soromi_protocol::RemoteConfig;

use crate::home::soromi_home;

/// Port the daemon's WebSocket server listens on. `SOROMI_PORT` overrides the default.
pub const DAEMON_PORT: u16 = 8317;

pub fn port() -> u16 {
    std::env::var("SOROMI_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DAEMON_PORT)
}

/// The relay to dial when a config value / env var is unset (Soromi's hosted relay).
const DEFAULT_RELAY_URL: &str = "wss://relay.soromi.dev";
/// The web viewport base to point pairing QRs at when unset (Soromi's hosted web app).
const DEFAULT_WEB_URL: &str = "https://remote.soromi.dev";
/// The relay access key when unset. Public builds share this default so they reach the public
/// relay with no setup; self-hosters set their own so only their daemons can create rooms.
const DEFAULT_ACCESS_KEY: &str = "soromi";

/// The persisted remote overrides in `~/.soromi/config.json`. Empty fields mean "not overridden".
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConfig {
    #[serde(default)]
    relay_url: String,
    #[serde(default)]
    web_url: String,
    #[serde(default)]
    access_key: String,
}

fn config_path() -> PathBuf {
    soromi_home().join("config.json")
}

fn load_config() -> StoredConfig {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// Resolves a value: the config-file override (if non-empty), then the env var, then the default.
fn resolve(stored: &str, env: &str, default: &str) -> String {
    if !stored.trim().is_empty() {
        return stored.trim().to_string();
    }
    std::env::var(env)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default.to_string())
}

/// The relay to dial for devices. Config file (`relayUrl`) > `SOROMI_RELAY_URL` > default.
pub fn relay_url() -> String {
    resolve(
        &load_config().relay_url,
        "SOROMI_RELAY_URL",
        DEFAULT_RELAY_URL,
    )
}

/// The web viewport base the pairing QR points at. Config file (`webUrl`) > `SOROMI_WEB_URL` > default.
pub fn web_url() -> String {
    resolve(&load_config().web_url, "SOROMI_WEB_URL", DEFAULT_WEB_URL)
}

/// The relay access key the daemon presents to create a room. Config file (`accessKey`) >
/// `SOROMI_RELAY_ACCESS_KEY` > default (`soromi`).
pub fn access_key() -> String {
    resolve(
        &load_config().access_key,
        "SOROMI_RELAY_ACCESS_KEY",
        DEFAULT_ACCESS_KEY,
    )
}

/// The resolved remote config (what pairing actually uses), for the settings screen.
pub fn remote_config() -> RemoteConfig {
    RemoteConfig {
        relay_url: relay_url(),
        web_url: web_url(),
        access_key: access_key(),
    }
}

/// Persists the remote overrides to `~/.soromi/config.json`. Empty fields clear an override. Returns
/// the resolved config after the change.
pub fn set_remote_config(config: &RemoteConfig) -> std::io::Result<RemoteConfig> {
    let stored = StoredConfig {
        relay_url: config.relay_url.trim().to_string(),
        web_url: config.web_url.trim().to_string(),
        access_key: config.access_key.trim().to_string(),
    };
    let json = serde_json::to_string_pretty(&stored)?;

    std::fs::create_dir_all(soromi_home())?;
    std::fs::write(config_path(), format!("{json}\n"))?;

    Ok(remote_config())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_prefers_stored_then_falls_back_to_default() {
        // A non-existent env var isolates the stored-vs-default paths from the real environment.
        assert_eq!(
            resolve("wss://host", "SOROMI_NONEXISTENT_TEST_VAR", "def"),
            "wss://host"
        );
        assert_eq!(resolve("", "SOROMI_NONEXISTENT_TEST_VAR", "def"), "def");
        // A blank (whitespace) override is treated as unset.
        assert_eq!(resolve("   ", "SOROMI_NONEXISTENT_TEST_VAR", "def"), "def");
    }
}
