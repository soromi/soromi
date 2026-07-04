use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::session::{Session, SessionOptions};

/// Owns the workspace-to-session map, one session per workspace. Interior-mutable so it can be
/// shared across async connections behind an `Arc`.
#[derive(Default)]
pub struct SessionManager {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the existing session for a workspace, or spawns one.
    pub fn ensure(&self, workspace: &str, opts: SessionOptions) -> anyhow::Result<Arc<Session>> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(existing) = sessions.get(workspace) {
            return Ok(existing.clone());
        }
        let session = Arc::new(Session::spawn(opts)?);
        sessions.insert(workspace.to_string(), session.clone());
        Ok(session)
    }

    pub fn get(&self, workspace: &str) -> Option<Arc<Session>> {
        self.sessions.lock().unwrap().get(workspace).cloned()
    }

    pub fn names(&self) -> Vec<String> {
        self.sessions.lock().unwrap().keys().cloned().collect()
    }

    pub fn dispose(&self, workspace: &str) {
        if let Some(session) = self.sessions.lock().unwrap().remove(workspace) {
            session.shutdown();
        }
    }

    pub fn dispose_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for session in sessions.values() {
            session.shutdown();
        }
        sessions.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> SessionOptions {
        SessionOptions {
            command: "/bin/cat".into(),
            args: vec![],
            cwd: ".".into(),
            env: None,
            cols: 80,
            rows: 24,
        }
    }

    #[test]
    fn ensure_reuses_an_existing_session() {
        let manager = SessionManager::new();
        let first = manager.ensure("kazomi", opts()).unwrap();
        let second = manager.ensure("kazomi", opts()).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(manager.names(), vec!["kazomi".to_string()]);
        manager.dispose_all();
    }

    #[test]
    fn get_returns_none_for_unknown_and_some_after_ensure() {
        let manager = SessionManager::new();
        assert!(manager.get("nope").is_none());
        manager.ensure("kazomi", opts()).unwrap();
        assert!(manager.get("kazomi").is_some());
        manager.dispose("kazomi");
        assert!(manager.get("kazomi").is_none());
    }
}
