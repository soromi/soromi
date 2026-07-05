use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use soromi_protocol::Status;

use super::notifier::{Notification, Notifier};

const DEBOUNCE: Duration = Duration::from_millis(3500);

fn is_attention(status: Status) -> bool {
    matches!(
        status,
        Status::WaitingInput | Status::Blocked | Status::Done
    )
}

struct SessionState {
    status: Status,
    fired: bool,
    pending: bool,
    /// Bumped whenever a pending timer should be invalidated (session left attention).
    generation: u64,
}

struct Inner {
    /// Attention state per session id.
    states: HashMap<String, SessionState>,
    /// Muted workspace names (mute is per workspace, so it silences all its sessions).
    muted: HashSet<String>,
}

/// Decides when to fire notifications from status transitions. Fires on entering an attention
/// state (waiting-input / blocked / done) after a debounce, at most once per episode (re-armed
/// when the session leaves the attention states). State is per session; mute is per workspace.
/// Timers run as tokio tasks, so it must be used within a runtime.
pub struct NotificationController {
    notifier: Arc<dyn Notifier>,
    debounce: Duration,
    inner: Arc<Mutex<Inner>>,
}

impl NotificationController {
    pub fn new(notifier: Arc<dyn Notifier>) -> Self {
        Self::with_debounce(notifier, DEBOUNCE)
    }

    pub fn with_debounce(notifier: Arc<dyn Notifier>, debounce: Duration) -> Self {
        Self {
            notifier,
            debounce,
            inner: Arc::new(Mutex::new(Inner {
                states: HashMap::new(),
                muted: HashSet::new(),
            })),
        }
    }

    pub fn set_muted(&self, workspace: &str, muted: bool) {
        let mut inner = self.inner.lock().unwrap();
        if muted {
            inner.muted.insert(workspace.to_string());
        } else {
            inner.muted.remove(workspace);
        }
    }

    pub fn is_muted(&self, workspace: &str) -> bool {
        self.inner.lock().unwrap().muted.contains(workspace)
    }

    /// Fires a banner immediately for a discrete agent event (silent, since the sound player
    /// owns the audio), unless the workspace is muted.
    pub fn fire(&self, workspace: &str, text: &str) {
        if self.is_muted(workspace) {
            return;
        }
        self.notifier.notify(Notification {
            title: "Soromi".into(),
            message: format!("\"{workspace}\" {text}"),
            sound: false,
        });
    }

    pub fn handle(&self, workspace: &str, session: &str, status: Status) {
        let mut inner = self.inner.lock().unwrap();
        let state = inner
            .states
            .entry(session.to_string())
            .or_insert(SessionState {
                status: Status::Idle,
                fired: false,
                pending: false,
                generation: 0,
            });
        state.status = status;

        if !is_attention(status) {
            state.generation += 1;
            state.pending = false;
            state.fired = false;
            return;
        }

        if state.fired || state.pending {
            return;
        }
        state.pending = true;
        let generation = state.generation;
        drop(inner);

        let inner = self.inner.clone();
        let notifier = self.notifier.clone();
        let debounce = self.debounce;
        let workspace = workspace.to_string();
        let session = session.to_string();
        tokio::spawn(async move {
            tokio::time::sleep(debounce).await;
            let (status, muted) = {
                let mut guard = inner.lock().unwrap();
                let Some(state) = guard.states.get_mut(&session) else {
                    return;
                };
                if state.generation != generation {
                    return;
                }
                state.pending = false;
                if !is_attention(state.status) {
                    return;
                }
                state.fired = true;
                (state.status, guard.muted.contains(&workspace))
            };
            if !muted {
                notifier.notify(message_for(&workspace, status));
            }
        });
    }

    pub fn dispose(&self) {
        let mut inner = self.inner.lock().unwrap();
        for state in inner.states.values_mut() {
            state.generation += 1;
            state.pending = false;
        }
        inner.states.clear();
    }
}

fn message_for(workspace: &str, status: Status) -> Notification {
    let text = match status {
        Status::WaitingInput => "needs your input",
        Status::Blocked => "is blocked",
        _ => "finished",
    };
    Notification {
        title: "Soromi".into(),
        // Silent: the sound player owns the audio cue (immediate, per event), so the banner
        // does not double it up.
        message: format!("\"{workspace}\" {text}"),
        sound: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Recording {
        messages: Mutex<Vec<String>>,
    }
    impl Notifier for Recording {
        fn notify(&self, notification: Notification) {
            self.messages.lock().unwrap().push(notification.message);
        }
    }

    #[tokio::test]
    async fn fires_once_after_the_debounce() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::with_debounce(rec.clone(), Duration::from_millis(20));
        ctrl.handle("kazomi", "s1", Status::WaitingInput);
        ctrl.handle("kazomi", "s1", Status::WaitingInput); // still pending, no second timer
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert_eq!(rec.messages.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn leaving_attention_before_the_debounce_cancels() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::with_debounce(rec.clone(), Duration::from_millis(30));
        ctrl.handle("kazomi", "s1", Status::WaitingInput);
        ctrl.handle("kazomi", "s1", Status::Thinking);
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert!(rec.messages.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn muted_workspace_does_not_fire() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::with_debounce(rec.clone(), Duration::from_millis(20));
        ctrl.set_muted("kazomi", true);
        ctrl.handle("kazomi", "s1", Status::Done);
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert!(rec.messages.lock().unwrap().is_empty());
    }
}
