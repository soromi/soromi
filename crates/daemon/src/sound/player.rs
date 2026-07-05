use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;

use soromi_protocol::Status;

/// A short audio cue for an agent event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cue {
    /// The agent needs the user: a permission or input prompt.
    Request,
    /// The agent is blocked or raising a question.
    Question,
    /// The agent finished its task.
    Complete,
}

/// The cue a status transition should play, or `None` when it needs no sound.
pub fn cue_for(status: Status) -> Option<Cue> {
    match status {
        Status::WaitingInput => Some(Cue::Request),
        Status::Blocked => Some(Cue::Question),
        Status::Done => Some(Cue::Complete),
        Status::Thinking | Status::Idle => None,
    }
}

/// Plays audio cues for agent events. Per-OS implementations sit behind this trait.
pub trait SoundPlayer: Send + Sync {
    fn play(&self, cue: Cue);
}

// Bundled with the daemon so cues play regardless of where the app is installed.
const REQUEST: &[u8] = include_bytes!("../../assets/sounds/request.wav");
const QUESTION: &[u8] = include_bytes!("../../assets/sounds/question.wav");
const COMPLETE: &[u8] = include_bytes!("../../assets/sounds/complete.wav");

/// macOS cues via `afplay`. The embedded wavs are written to a temp cache once, so a file path
/// exists to play. Fire-and-forget; never crashes the daemon.
pub struct MacSoundPlayer {
    request: PathBuf,
    question: PathBuf,
    complete: PathBuf,
}

impl MacSoundPlayer {
    fn new() -> Self {
        let dir = std::env::temp_dir().join("soromi-sounds");
        let _ = fs::create_dir_all(&dir);
        let write = |name: &str, bytes: &[u8]| {
            let path = dir.join(name);
            let _ = fs::write(&path, bytes);
            path
        };
        Self {
            request: write("request.wav", REQUEST),
            question: write("question.wav", QUESTION),
            complete: write("complete.wav", COMPLETE),
        }
    }
}

impl SoundPlayer for MacSoundPlayer {
    fn play(&self, cue: Cue) {
        let path = match cue {
            Cue::Request => &self.request,
            Cue::Question => &self.question,
            Cue::Complete => &self.complete,
        };
        let _ = Command::new("afplay")
            .arg(path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}

/// No-op player for unsupported platforms and tests.
pub struct NoopSoundPlayer;

impl SoundPlayer for NoopSoundPlayer {
    fn play(&self, _cue: Cue) {}
}

pub fn create_sound_player() -> Arc<dyn SoundPlayer> {
    if cfg!(target_os = "macos") {
        Arc::new(MacSoundPlayer::new())
    } else {
        Arc::new(NoopSoundPlayer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_statuses_to_cues() {
        assert_eq!(cue_for(Status::WaitingInput), Some(Cue::Request));
        assert_eq!(cue_for(Status::Blocked), Some(Cue::Question));
        assert_eq!(cue_for(Status::Done), Some(Cue::Complete));
        assert_eq!(cue_for(Status::Thinking), None);
        assert_eq!(cue_for(Status::Idle), None);
    }
}
