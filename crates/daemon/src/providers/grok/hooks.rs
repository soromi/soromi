use std::fs;
use std::io;
use std::path::Path;

use serde_json::json;

/// The Grok events Soromi hooks, paired with the cue the bridge is invoked with. Grok has no
/// permission-request event (only `PreToolUse`, which fires for every tool), so we hook `Stop`
/// (turn finished) for the completion cue; "needs you" status is not available for Grok yet.
const HOOKS: &[(&str, &str)] = &[("Stop", "complete")];

/// Installs Soromi's agent-event hooks for a Grok config dir. Grok loads every JSON file under
/// `<config>/hooks/` and uses the same shape as Claude Code, so we own a single `soromi.json`
/// (no merge: the user's own hooks live in other files). Each hook runs this binary as a bridge
/// (`<exe> hook <cue> grok`), which delivers the event to the daemon over its socket. Idempotent:
/// it just rewrites our file.
pub(super) fn install(config_dir: &Path) -> io::Result<()> {
    let Ok(exe) = std::env::current_exe() else {
        return Ok(());
    };
    let exe = exe.to_string_lossy().into_owned();

    let mut events = serde_json::Map::new();
    for (event, cue) in HOOKS {
        events.insert(
            (*event).to_string(),
            json!([{
                "hooks": [{
                    "type": "command",
                    "command": exe,
                    "args": ["hook", cue, "grok"],
                    "async": true
                }]
            }]),
        );
    }

    let dir = config_dir.join("hooks");
    fs::create_dir_all(&dir)?;
    let json = serde_json::to_string_pretty(&json!({ "hooks": events }))?;
    fs::write(dir.join("soromi.json"), format!("{json}\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn install_writes_a_stop_hook_that_runs_the_bridge() {
        let dir = tempfile::tempdir().unwrap();
        install(dir.path()).unwrap();
        install(dir.path()).unwrap(); // idempotent: a second run must not error or duplicate

        let raw = fs::read_to_string(dir.path().join("hooks").join("soromi.json")).unwrap();
        let root: Value = serde_json::from_str(&raw).unwrap();
        let stop = root["hooks"]["Stop"].as_array().unwrap();

        assert_eq!(stop.len(), 1);
        let hook = &stop[0]["hooks"][0];
        assert_eq!(hook["args"], json!(["hook", "complete", "grok"]));
    }
}
