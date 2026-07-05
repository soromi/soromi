/// Port the daemon's WebSocket server listens on. `SOROMI_PORT` overrides the default.
pub const DAEMON_PORT: u16 = 8317;

pub fn port() -> u16 {
    std::env::var("SOROMI_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DAEMON_PORT)
}

/// A known AI provider: the env var that points it at an isolated config directory, plus how to
/// tell whether that directory is logged in. Auth tokens may live in the OS keychain, so the
/// marker is a config file that exists and (optionally) carries an account key.
pub struct Provider {
    pub key: &'static str,
    pub config_env_var: &'static str,
    /// File, relative to the config dir, that must exist.
    pub credential_file: &'static str,
    /// Optional top-level JSON key in that file that must be present and non-null (an account
    /// object). `None` means the file existing is enough.
    pub credential_key: Option<&'static str>,
}

/// The provider registry. Adding a provider is a one-line entry here.
pub const PROVIDERS: &[Provider] = &[
    // Claude keeps the token in the keychain; `.claude.json` gains an `oauthAccount` on login.
    Provider {
        key: "claude",
        config_env_var: "CLAUDE_CONFIG_DIR",
        credential_file: ".claude.json",
        credential_key: Some("oauthAccount"),
    },
    Provider {
        key: "codex",
        config_env_var: "CODEX_HOME",
        credential_file: "auth.json",
        credential_key: None,
    },
];
