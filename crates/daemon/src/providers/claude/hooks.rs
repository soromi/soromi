use std::fs;
use std::io;
use std::path::Path;

use serde_json::{Value, json};

/// The events Soromi installs Claude hooks for, paired with the cue the bridge is invoked with.
/// `session-start` is not a sound cue: it reports Claude's own conversation id so the tab can be
/// resumed later.
const HOOKS: &[(&str, &str)] = &[
    ("PermissionRequest", "request"),
    ("Notification", "question"),
    ("Stop", "complete"),
    ("SessionStart", "session-start"),
];

/// Installs Soromi's agent-event hooks into a Claude config dir's `settings.json`. Each hook is a
/// command that runs this binary as a bridge (`<exe> hook <cue>`), which delivers the event to the
/// daemon over its socket. Merges non-destructively: only our entries (args start with `hook`) are
/// replaced, so a user's own hooks in the same events survive. Idempotent.
pub(super) fn install(config_dir: &Path) -> io::Result<()> {
    let Ok(exe) = std::env::current_exe() else {
        return Ok(());
    };
    let exe = exe.to_string_lossy().into_owned();
    let settings_path = config_dir.join("settings.json");

    let mut root: Value = fs::read_to_string(&settings_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| json!({}));
    if !root.is_object() {
        root = json!({});
    }
    let hooks = root
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let hooks = hooks.as_object_mut().unwrap();

    for (event, cue) in HOOKS {
        let entry = hooks.entry(*event).or_insert_with(|| json!([]));
        if !entry.is_array() {
            *entry = json!([]);
        }
        let list = entry.as_array_mut().unwrap();
        list.retain(|item| !is_ours(item));
        list.push(json!({
            "hooks": [{
                "type": "command",
                "command": exe,
                "args": ["hook", cue, "claude"],
                "async": true
            }]
        }));
    }

    fs::create_dir_all(config_dir)?;
    let json = serde_json::to_string_pretty(&root)?;
    fs::write(&settings_path, format!("{json}\n"))
}

/// True when a hook-array entry is one of ours (its command runs us with `hook` as the first arg).
fn is_ours(entry: &Value) -> bool {
    entry
        .get("hooks")
        .and_then(|hooks| hooks.as_array())
        .map(|hooks| {
            hooks.iter().any(|hook| {
                hook.get("args")
                    .and_then(Value::as_array)
                    .and_then(|args| args.first())
                    .and_then(Value::as_str)
                    == Some("hook")
            })
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn install_is_idempotent_and_preserves_foreign_hooks() {
        let dir = tempdir().unwrap();
        // A user's own Stop hook that must survive.
        fs::write(
            dir.path().join("settings.json"),
            r#"{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "user-thing" }] }] } }"#,
        )
        .unwrap();

        install(dir.path()).unwrap();
        install(dir.path()).unwrap(); // second run must not duplicate

        let root: Value =
            serde_json::from_str(&fs::read_to_string(dir.path().join("settings.json")).unwrap())
                .unwrap();
        let stop = root["hooks"]["Stop"].as_array().unwrap();
        // The user's hook plus exactly one Soromi hook (not two).
        assert_eq!(stop.len(), 2);
        assert!(
            stop.iter()
                .any(|e| e["hooks"][0]["command"] == "user-thing")
        );
        assert!(stop.iter().any(|e| e["hooks"][0]["args"][0] == "hook"));
        assert_eq!(
            root["hooks"]["PermissionRequest"].as_array().unwrap().len(),
            1
        );
    }
}
