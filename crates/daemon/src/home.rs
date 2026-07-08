use std::path::PathBuf;
use std::sync::RwLock;

/// An explicit override for the store root (tests / embedding), checked before `SOROMI_HOME`.
/// Safe, lock-guarded global state, so it never mutates the process environment.
static HOME_OVERRIDE: RwLock<Option<PathBuf>> = RwLock::new(None);

/// Root of the local Soromi store. Resolution order: an explicit override, then the `SOROMI_HOME`
/// env var, then the default `~/.soromi`.
pub fn soromi_home() -> PathBuf {
    if let Some(path) = HOME_OVERRIDE.read().unwrap().clone() {
        return path;
    }
    if let Ok(base) = std::env::var("SOROMI_HOME") {
        return PathBuf::from(base);
    }
    dirs::home_dir().unwrap_or_default().join(".soromi")
}

/// Overrides the store root without touching the process environment. `None` clears it.
pub fn set_soromi_home(path: Option<PathBuf>) {
    *HOME_OVERRIDE.write().unwrap() = path;
}
