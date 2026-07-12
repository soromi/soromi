use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use tokio::sync::broadcast;

/// Coalesce burst events (saves, git checkouts) into one refresh per directory.
const DEBOUNCE: Duration = Duration::from_millis(300);

/// Watches the directories the file tree currently shows and announces when one changes, so the
/// viewport re-lists just that folder. Watches are non-recursive and only cover directories a
/// viewport has listed (root + expanded folders), never whole trees, so a deep `node_modules`
/// costs nothing until it is opened. Best-effort: if the OS watcher cannot start, listings simply
/// stay on-demand (the prior behavior).
pub struct DirectoryWatcher {
    debouncer: Mutex<Option<Debouncer<RecommendedWatcher>>>,
    /// Absolute watched directory -> the (workspace, relative path) whose listing it backs.
    watched: Arc<Mutex<HashMap<PathBuf, (String, String)>>>,
}

impl DirectoryWatcher {
    /// Builds a watcher that sends `(workspace, path)` on `changes` whenever a watched dir changes.
    pub fn new(changes: broadcast::Sender<(String, String)>) -> Self {
        let watched: Arc<Mutex<HashMap<PathBuf, (String, String)>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let lookup = watched.clone();
        let debouncer = new_debouncer(DEBOUNCE, move |result: DebounceEventResult| {
            let Ok(events) = result else {
                return;
            };
            let map = lookup.lock().unwrap();
            let mut fired: HashSet<(String, String)> = HashSet::new();
            for event in events {
                // A non-recursive watch on D reports D itself or an entry directly in it, so the
                // affected watched dir is the event path or its parent.
                let dir = if map.contains_key(&event.path) {
                    Some(event.path.clone())
                } else {
                    event
                        .path
                        .parent()
                        .filter(|parent| map.contains_key(*parent))
                        .map(Path::to_path_buf)
                };
                if let Some((workspace, path)) = dir.and_then(|dir| map.get(&dir))
                    && fired.insert((workspace.clone(), path.clone()))
                {
                    let _ = changes.send((workspace.clone(), path.clone()));
                }
            }
        })
        .ok();
        Self {
            debouncer: Mutex::new(debouncer),
            watched,
        }
    }

    /// Starts watching `dir` (the directory backing `workspace`'s `path` listing) if new.
    pub fn watch(&self, workspace: &str, path: &str, dir: &Path) {
        let dir = dir.to_path_buf();
        {
            let mut map = self.watched.lock().unwrap();
            if map.contains_key(&dir) {
                return;
            }
            map.insert(dir.clone(), (workspace.to_string(), path.to_string()));
        }
        if let Some(debouncer) = self.debouncer.lock().unwrap().as_mut() {
            let _ = debouncer.watcher().watch(&dir, RecursiveMode::NonRecursive);
        }
    }

    /// Stops watching every directory belonging to a workspace (it was removed).
    pub fn unwatch_workspace(&self, workspace: &str) {
        let mut removed = Vec::new();
        {
            let mut map = self.watched.lock().unwrap();
            map.retain(|dir, (ws, _)| {
                let keep = ws != workspace;
                if !keep {
                    removed.push(dir.clone());
                }
                keep
            });
        }
        if let Some(debouncer) = self.debouncer.lock().unwrap().as_mut() {
            for dir in removed {
                let _ = debouncer.watcher().unwatch(&dir);
            }
        }
    }
}
