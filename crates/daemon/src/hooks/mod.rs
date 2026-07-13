use std::path::PathBuf;

use serde::Deserialize;

use crate::home::soromi_home;
use crate::sound::player::Cue;

pub mod bridge;
pub mod listen;

/// The unix socket the daemon listens on and the `hook` bridge connects to.
pub fn socket_path() -> PathBuf {
    soromi_home().join("daemon.sock")
}

/// One agent-event delivered over the socket by the bridge.
#[derive(Debug, Deserialize)]
pub(crate) struct Event {
    pub cue: String,
    pub session: String,
    /// The agent that fired it (e.g. `claude`), when the hook passed it.
    #[serde(default)]
    pub agent: Option<String>,
    /// The agent's own conversation id, on a `session-start` event, so the tab can resume it.
    #[serde(default)]
    pub resume_id: Option<String>,
}

pub(crate) fn cue_from(name: &str) -> Option<Cue> {
    match name {
        "request" => Some(Cue::Request),
        "question" => Some(Cue::Question),
        "complete" => Some(Cue::Complete),
        _ => None,
    }
}
