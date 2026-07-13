/// Port the daemon's WebSocket server listens on. `SOROMI_PORT` overrides the default.
pub const DAEMON_PORT: u16 = 8317;

pub fn port() -> u16 {
    std::env::var("SOROMI_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DAEMON_PORT)
}
