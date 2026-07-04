use std::path::PathBuf;

/// Root of the local Soromi store. `SOROMI_HOME` overrides the default `~/.soromi`.
pub fn soromi_home() -> PathBuf {
    if let Ok(base) = std::env::var("SOROMI_HOME") {
        return PathBuf::from(base);
    }
    dirs::home_dir().unwrap_or_default().join(".soromi")
}
