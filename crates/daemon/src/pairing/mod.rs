pub mod device;
pub mod service;

pub use service::PairingService;

/// The relay to dial for devices, overridable via `SOROMI_RELAY_URL`.
pub fn relay_url() -> String {
    std::env::var("SOROMI_RELAY_URL")
        .ok()
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| "ws://localhost:8787".to_string())
}

/// The web viewport base the pairing QR points at, overridable via `SOROMI_WEB_URL`.
pub fn web_url() -> String {
    std::env::var("SOROMI_WEB_URL")
        .ok()
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| "http://localhost:1430".to_string())
}
