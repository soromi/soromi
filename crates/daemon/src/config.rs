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

/// The relay to dial when a config value / env var is unset.
const DEFAULT_RELAY_URL: &str = "ws://localhost:8787";
/// The web viewport base to point pairing QRs at when unset.
const DEFAULT_WEB_URL: &str = "http://localhost:1430";

/// The persisted remote overrides in `~/.soromi/config.json`. Empty fields mean "not overridden".
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConfig {
    #[serde(default)]
    relay_url: String,
    #[serde(default)]
    web_url: String,
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

/// The resolved remote config (what pairing actually uses), for the settings screen.
pub fn remote_config() -> RemoteConfig {
    RemoteConfig {
        relay_url: relay_url(),
        web_url: web_url(),
    }
}

/// Persists the remote overrides to `~/.soromi/config.json`. Empty fields clear an override. Returns
/// the resolved config after the change.
pub fn set_remote_config(config: &RemoteConfig) -> std::io::Result<RemoteConfig> {
    let stored = StoredConfig {
        relay_url: config.relay_url.trim().to_string(),
        web_url: config.web_url.trim().to_string(),
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
