use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::session::{Session, SessionOptions};
use super::stream_json::StreamJsonSession;

/// Owns the live sessions, one entry per tab, keyed by id. A tab is EITHER a PTY terminal or a
/// headless chat (never both at once - a mode switch tears one down before spawning the other), so
/// the two maps are disjoint by id. Interior-mutable to share across async connections behind `Arc`.
#[derive(Default)]
pub struct SessionManager {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    chat: Mutex<HashMap<String, Arc<StreamJsonSession>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the existing session for an id, or spawns one.
    pub fn ensure(&self, id: &str, opts: SessionOptions) -> anyhow::Result<Arc<Session>> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(existing) = sessions.get(id) {
            return Ok(existing.clone());
        }
        let session = Arc::new(Session::spawn(opts)?);
        sessions.insert(id.to_string(), session.clone());
        Ok(session)
    }

    pub fn get(&self, id: &str) -> Option<Arc<Session>> {
        self.sessions.lock().unwrap().get(id).cloned()
    }

    /// Returns the existing headless chat session for an id, or spawns one from the given backend.
    pub fn ensure_chat(
        &self,
        id: &str,
        spawn: impl FnOnce() -> anyhow::Result<StreamJsonSession>,
    ) -> anyhow::Result<Arc<StreamJsonSession>> {
        let mut chat = self.chat.lock().unwrap();
        if let Some(existing) = chat.get(id) {
            return Ok(existing.clone());
        }
        let session = Arc::new(spawn()?);
        chat.insert(id.to_string(), session.clone());
        Ok(session)
    }

    pub fn get_chat(&self, id: &str) -> Option<Arc<StreamJsonSession>> {
        self.chat.lock().unwrap().get(id).cloned()
    }

    pub fn names(&self) -> Vec<String> {
        self.sessions.lock().unwrap().keys().cloned().collect()
    }

    /// Removes a tab from whichever map holds it (terminal or chat) and stops it.
    pub fn dispose(&self, id: &str) {
        if let Some(session) = self.sessions.lock().unwrap().remove(id) {
            session.shutdown();
        }
        if let Some(session) = self.chat.lock().unwrap().remove(id) {
            session.shutdown();
        }
    }

    pub fn dispose_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for session in sessions.values() {
            session.shutdown();
        }
        sessions.clear();
        let mut chat = self.chat.lock().unwrap();
        for session in chat.values() {
            session.shutdown();
        }
        chat.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> SessionOptions {
        SessionOptions {
            agent: "claude".into(),
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
