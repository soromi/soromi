pub mod device;
pub mod service;

pub use service::{DirectSettings, PairingService};

/// The relay to dial for devices. Resolved from the runtime config (file > env > default).
pub fn relay_url() -> String {
    crate::config::relay_url()
}

/// The relay access key the daemon presents to create a room. Resolved from the runtime config.
pub fn access_key() -> String {
    crate::config::access_key()
}

/// Whether paired devices may connect directly, and on which port. Resolved from the runtime config.
pub fn direct_settings() -> DirectSettings {
    DirectSettings {
        enabled: crate::config::direct_enabled(),
        port: crate::config::direct_port(),
    }
}
