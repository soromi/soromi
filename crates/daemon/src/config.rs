use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use soromi_protocol::{RemoteConfig, RemoteDefaults};

use crate::home::soromi_home;

/// Port the daemon's WebSocket server listens on. `SOROMI_PORT` overrides the default.
pub const DAEMON_PORT: u16 = 8317;

pub fn port() -> u16 {
    std::env::var("SOROMI_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DAEMON_PORT)
}

/// Port paired devices connect to directly when they share a network with this computer.
/// `SOROMI_DIRECT_PORT` overrides the default. A fixed port lets a phone that was told this
/// computer's address find it there again after the daemon restarts.
pub const DIRECT_PORT: u16 = 8318;

pub fn direct_port() -> u16 {
    std::env::var("SOROMI_DIRECT_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DIRECT_PORT)
}

/// The relay to dial when a config value / env var is unset (Soromi's hosted relay).
const DEFAULT_RELAY_URL: &str = "wss://relay.soromi.dev";
/// The relay access key when unset: the one Soromi's hosted relay is run with. It ships in every
/// build, so it is not a secret and keeps nobody out of that relay; self-hosters set their own (on
/// the relay and here) so only their daemons can open rooms.
const DEFAULT_ACCESS_KEY: &str = "soromi";

/// The persisted remote overrides in `~/.soromi/config.json`. Empty fields mean "not overridden".
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConfig {
    #[serde(default)]
    relay_url: String,
    #[serde(default)]
    access_key: String,
    /// Whether paired devices may connect directly on a shared network. Absent means on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    direct: Option<bool>,
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

/// The relay access key the daemon presents to create a room. Config file (`accessKey`) >
/// `SOROMI_RELAY_ACCESS_KEY` > default (`soromi`).
pub fn access_key() -> String {
    resolve(
        &load_config().access_key,
        "SOROMI_RELAY_ACCESS_KEY",
        DEFAULT_ACCESS_KEY,
    )
}

/// Whether paired devices may connect straight to this computer on a network they share with it.
/// On unless turned off: config file (`direct`) > `SOROMI_DIRECT` (`0`, `off` or `false`) > on.
pub fn direct_enabled() -> bool {
    if let Some(direct) = load_config().direct {
        return direct;
    }
    !matches!(
        std::env::var("SOROMI_DIRECT").as_deref().map(str::trim),
        Ok("0" | "off" | "false")
    )
}

/// The resolved remote config: what pairing actually uses.
pub fn remote_config() -> RemoteConfig {
    RemoteConfig {
        relay_url: relay_url(),
        access_key: access_key(),
        direct: direct_enabled(),
    }
}

/// What the relay settings fall back to when the config file does not override them: the
/// environment, or else the built-in values.
pub fn remote_defaults() -> RemoteDefaults {
    RemoteDefaults {
        relay_url: resolve("", "SOROMI_RELAY_URL", DEFAULT_RELAY_URL),
        access_key: resolve("", "SOROMI_RELAY_ACCESS_KEY", DEFAULT_ACCESS_KEY),
    }
}

/// The remote settings as the user set them, for the settings screen: a relay setting that was
/// never overridden is empty, so the screen can show it as the default it is.
pub fn remote_overrides() -> RemoteConfig {
    let stored = load_config();
    let defaults = remote_defaults();

    RemoteConfig {
        relay_url: override_of(&stored.relay_url, &defaults.relay_url),
        access_key: override_of(&stored.access_key, &defaults.access_key),
        direct: direct_enabled(),
    }
}

/// A setting as an override: empty when it only repeats what it would fall back to anyway. Keeping
/// such a value would pin today's default, and leave the user on it after the default moves.
fn override_of(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value == fallback {
        String::new()
    } else {
        value.to_string()
    }
}

/// Persists the remote overrides to `~/.soromi/config.json`. Empty fields clear an override, and so
/// does a field that only repeats the default. Returns the resolved config after the change.
pub fn set_remote_config(config: &RemoteConfig) -> std::io::Result<RemoteConfig> {
    let defaults = remote_defaults();
    let stored = StoredConfig {
        relay_url: override_of(&config.relay_url, &defaults.relay_url),
        access_key: override_of(&config.access_key, &defaults.access_key),
        direct: Some(config.direct),
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
    fn a_setting_that_repeats_its_default_is_not_an_override() {
        assert_eq!(
            override_of("wss://relay.soromi.dev", "wss://relay.soromi.dev"),
            ""
        );
        assert_eq!(
            override_of(" wss://mine.example ", "wss://relay.soromi.dev"),
            "wss://mine.example"
        );
        assert_eq!(override_of("", "soromi"), "");
    }

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
