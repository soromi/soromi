pub mod device;
pub mod service;

pub use service::PairingService;

/// The relay to dial for devices. Resolved from the runtime config (file > env > default).
pub fn relay_url() -> String {
    crate::config::relay_url()
}

/// The web viewport base the pairing QR points at. Resolved from the runtime config.
pub fn web_url() -> String {
    crate::config::web_url()
}
