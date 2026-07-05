use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use soromi_protocol::{KeepAwakeMode, Status};

use super::backend::KeepAwake;

struct Inner {
    working: HashSet<String>,
    active: bool,
    mode: KeepAwakeMode,
}

/// Holds the machine awake according to the selected mode:
///
/// - `off`: never.
/// - `working`: while any session's agent is actively thinking.
/// - `always`: unconditionally.
///
/// Engages/releases the backend only on a real transition. Interior-mutable so it can be
/// shared across the status watchers and the connection.
pub struct KeepAwakeController {
    backend: Arc<dyn KeepAwake>,
    inner: Mutex<Inner>,
}

impl KeepAwakeController {
    pub fn new(backend: Arc<dyn KeepAwake>, mode: KeepAwakeMode) -> Self {
        Self {
            backend,
            inner: Mutex::new(Inner {
                working: HashSet::new(),
                active: false,
                mode,
            }),
        }
    }

    /// Updates from a session's status; returns true if the engaged state changed.
    pub fn handle(&self, session: &str, status: Status) -> bool {
        let mut inner = self.inner.lock().unwrap();
        if status == Status::Thinking {
            inner.working.insert(session.to_string());
        } else {
            inner.working.remove(session);
        }
        self.recompute(&mut inner)
    }

    /// Switches mode; returns true if the engaged state changed.
    pub fn set_mode(&self, mode: KeepAwakeMode) -> bool {
        let mut inner = self.inner.lock().unwrap();
        inner.mode = mode;
        self.recompute(&mut inner)
    }

    pub fn mode(&self) -> KeepAwakeMode {
        self.inner.lock().unwrap().mode
    }

    pub fn is_active(&self) -> bool {
        self.inner.lock().unwrap().active
    }

    pub fn dispose(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.working.clear();
        if inner.active {
            inner.active = false;
            self.backend.release();
        }
    }

    fn recompute(&self, inner: &mut Inner) -> bool {
        let next = match inner.mode {
            KeepAwakeMode::Always => true,
            KeepAwakeMode::Off => false,
            KeepAwakeMode::Working => !inner.working.is_empty(),
        };
        if next == inner.active {
            return false;
        }
        inner.active = next;
        if next {
            self.backend.engage();
        } else {
            self.backend.release();
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Recording {
        calls: Mutex<Vec<&'static str>>,
    }
    impl KeepAwake for Recording {
        fn engage(&self) {
            self.calls.lock().unwrap().push("engage");
        }
        fn release(&self) {
            self.calls.lock().unwrap().push("release");
        }
    }

    fn controller(mode: KeepAwakeMode) -> (KeepAwakeController, Arc<Recording>) {
        let backend = Arc::new(Recording::default());
        (KeepAwakeController::new(backend.clone(), mode), backend)
    }

    #[test]
    fn working_mode_engages_only_while_thinking() {
        let (ctrl, rec) = controller(KeepAwakeMode::Working);
        assert!(ctrl.handle("a", Status::Thinking));
        assert!(ctrl.is_active());
        assert!(ctrl.handle("a", Status::WaitingInput));
        assert!(!ctrl.is_active());
        assert_eq!(*rec.calls.lock().unwrap(), vec!["engage", "release"]);
    }

    #[test]
    fn off_mode_never_engages() {
        let (ctrl, rec) = controller(KeepAwakeMode::Off);
        assert!(!ctrl.handle("a", Status::Thinking));
        assert!(!ctrl.is_active());
        assert!(rec.calls.lock().unwrap().is_empty());
    }

    #[test]
    fn always_mode_engages_regardless_of_status() {
        let (ctrl, rec) = controller(KeepAwakeMode::Always);
        assert!(ctrl.handle("a", Status::Idle));
        assert!(ctrl.is_active());
        assert!(!ctrl.handle("a", Status::Thinking));
        assert_eq!(*rec.calls.lock().unwrap(), vec!["engage"]);
    }

    #[test]
    fn changing_mode_engages_and_releases() {
        let (ctrl, rec) = controller(KeepAwakeMode::Working);
        assert!(ctrl.set_mode(KeepAwakeMode::Always));
        assert!(ctrl.is_active());
        assert!(ctrl.set_mode(KeepAwakeMode::Off));
        assert!(!ctrl.is_active());
        assert_eq!(*rec.calls.lock().unwrap(), vec!["engage", "release"]);
    }
}
