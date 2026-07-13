use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::home::soromi_home;

const DEVICES_FILE: &str = "devices.json";

/// A paired remote device: its own relay room and end-to-end key. Persisted under `~/.soromi/`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub room: String,
    /// Base64 32-byte XChaCha20-Poly1305 key.
    pub key: String,
}

impl Device {
    /// Mints a device with a random id, relay room, and end-to-end key.
    pub fn generate(name: String) -> Device {
        Device {
            id: random_hex(8),
            name,
            room: random_hex(16),
            key: random_key(),
        }
    }
}

/// Loads persisted devices (empty on first run or on any read/parse error).
pub fn load_devices() -> Vec<Device> {
    let Ok(text) = std::fs::read_to_string(soromi_home().join(DEVICES_FILE)) else {
        return Vec::new();
    };

    serde_json::from_str(&text).unwrap_or_default()
}

/// Persists devices, best-effort.
pub fn save_devices(devices: &[Device]) {
    let home = soromi_home();
    let _ = std::fs::create_dir_all(&home);

    if let Ok(text) = serde_json::to_string_pretty(devices) {
        let _ = std::fs::write(home.join(DEVICES_FILE), text);
    }
}

/// A random lowercase-hex token of `bytes` bytes.
fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).expect("system RNG");

    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// A random base64 32-byte key.
fn random_key() -> String {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).expect("system RNG");

    base64::engine::general_purpose::STANDARD.encode(buf)
}
