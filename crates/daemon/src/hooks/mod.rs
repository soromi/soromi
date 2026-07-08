use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::{Value, json};

use crate::home::soromi_home;
use crate::sound::player::Cue;

pub mod bridge;
pub mod listen;

/// The events the daemon installs hooks for, paired with the cue arg the bridge is invoked with.
const HOOKS: &[(&str, &str)] = &[
    ("PermissionRequest", "request"),
    ("Notification", "question"),
    ("Stop", "complete"),
];

/// The unix socket the daemon listens on and the `hook` bridge connects to.
pub fn socket_path() -> PathBuf {
    soromi_home().join("daemon.sock")
}

/// One agent-event delivered over the socket by the bridge.
#[derive(Debug, Deserialize)]
pub(crate) struct Event {
    pub cue: String,
    pub session: String,
    /// The agent that fired it (e.g. `claude`), when the hook passed it.
    #[serde(default)]
    pub agent: Option<String>,
}

pub(crate) fn cue_from(name: &str) -> Option<Cue> {
    match name {
        "request" => Some(Cue::Request),
        "question" => Some(Cue::Question),
        "complete" => Some(Cue::Complete),
        _ => None,
    }
}

/// Installs Soromi's agent-event hooks into a Claude config dir's `settings.json`. Each hook is
/// a command that runs this binary as a bridge (`<exe> hook <cue>`), which delivers the event to
/// the daemon over its socket. Merges non-destructively: only our entries (args start with
/// `hook`) are replaced, so a user's own hooks in the same events survive. Idempotent.
pub fn ensure_claude_hooks(config_dir: &Path) -> io::Result<()> {
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

/// Points Codex's `notify` (in `config.toml`) at this binary as a bridge, so `agent-turn-complete`
/// reaches the daemon. Preserves the rest of the file (comments, keys) but replaces any existing
/// `notify` (Codex allows only one program). Idempotent.
pub fn ensure_codex_notify(config_dir: &Path) -> io::Result<()> {
    let Ok(exe) = std::env::current_exe() else {
        return Ok(());
    };
    let exe = exe.to_string_lossy().into_owned();
    let path = config_dir.join("config.toml");

    let mut doc: toml_edit::DocumentMut = fs::read_to_string(&path)
        .unwrap_or_default()
        .parse()
        .unwrap_or_default();
    let mut program = toml_edit::Array::new();
    program.push(exe);
    program.push("codex-notify");
    doc["notify"] = toml_edit::value(program);

    fs::create_dir_all(config_dir)?;
    fs::write(&path, doc.to_string())
}

/// Installs Soromi's Codex `PermissionRequest` hook into `config.toml` (the request cue; Codex's
/// `notify` already covers complete, so no `Stop` hook, to avoid a double cue). Codex hooks pass
/// JSON on stdin, so the command runs us as `<exe> codex-hook`. Merges non-destructively and is
/// idempotent. Note: Codex requires the user to trust project/user hooks via its `/hooks` command
/// before they fire.
pub fn ensure_codex_hooks(config_dir: &Path) -> io::Result<()> {
    use toml_edit::{ArrayOfTables, DocumentMut, Item, Table, value};

    let Ok(exe) = std::env::current_exe() else {
        return Ok(());
    };
    let command = format!("'{}' codex-hook", exe.to_string_lossy());
    let path = config_dir.join("config.toml");

    let mut doc: DocumentMut = fs::read_to_string(&path)
        .unwrap_or_default()
        .parse()
        .unwrap_or_default();

    if !doc.contains_key("hooks") || !doc["hooks"].is_table() {
        doc["hooks"] = Item::Table(Table::new());
    }
    let hooks = doc["hooks"].as_table_mut().unwrap();
    if !hooks.contains_key("PermissionRequest") || !hooks["PermissionRequest"].is_array_of_tables()
    {
        hooks["PermissionRequest"] = Item::ArrayOfTables(ArrayOfTables::new());
    }
    let events = hooks["PermissionRequest"].as_array_of_tables_mut().unwrap();

    // Drop any prior Soromi entry (its command runs `codex-hook`), then append a fresh one.
    let kept: Vec<Table> = events
        .iter()
        .filter(|entry| !is_codex_ours(entry))
        .cloned()
        .collect();
    *events = ArrayOfTables::new();
    for entry in kept {
        events.push(entry);
    }

    let mut inner = Table::new();
    inner["type"] = value("command");
    inner["command"] = value(&command);
    let mut inner_list = ArrayOfTables::new();
    inner_list.push(inner);
    let mut entry = Table::new();
    entry["hooks"] = Item::ArrayOfTables(inner_list);
    events.push(entry);

    fs::create_dir_all(config_dir)?;
    fs::write(&path, doc.to_string())
}

/// True when a Codex hook entry is one of ours (a `hooks` command running `codex-hook`).
fn is_codex_ours(entry: &toml_edit::Table) -> bool {
    entry
        .get("hooks")
        .and_then(toml_edit::Item::as_array_of_tables)
        .map(|hooks| {
            hooks.iter().any(|hook| {
                hook.get("command")
                    .and_then(toml_edit::Item::as_str)
                    .is_some_and(|command| command.contains("codex-hook"))
            })
        })
        .unwrap_or(false)
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

        ensure_claude_hooks(dir.path()).unwrap();
        ensure_claude_hooks(dir.path()).unwrap(); // second run must not duplicate

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

    #[test]
    fn codex_notify_is_set_and_preserves_other_keys() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("config.toml"), "model = \"gpt-5\"\n").unwrap();

        ensure_codex_notify(dir.path()).unwrap();
        ensure_codex_notify(dir.path()).unwrap(); // idempotent

        let doc: toml_edit::DocumentMut = fs::read_to_string(dir.path().join("config.toml"))
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(doc["model"].as_str(), Some("gpt-5")); // foreign key preserved
        let notify = doc["notify"].as_array().unwrap();
        assert_eq!(notify.len(), 2);
        assert_eq!(notify.get(1).unwrap().as_str(), Some("codex-notify"));
    }

    #[test]
    fn codex_permission_hook_is_idempotent_and_preserves_other_hooks() {
        let dir = tempdir().unwrap();
        // A user's own PreToolUse hook that must survive.
        fs::write(
            dir.path().join("config.toml"),
            "[[hooks.PreToolUse]]\n[[hooks.PreToolUse.hooks]]\ntype = \"command\"\ncommand = \"user-thing\"\n",
        )
        .unwrap();

        ensure_codex_hooks(dir.path()).unwrap();
        ensure_codex_hooks(dir.path()).unwrap(); // idempotent

        let doc: toml_edit::DocumentMut = fs::read_to_string(dir.path().join("config.toml"))
            .unwrap()
            .parse()
            .unwrap();
        // The user's hook survived, and exactly one Soromi PermissionRequest hook exists.
        assert!(doc["hooks"]["PreToolUse"].is_array_of_tables());
        let perm = doc["hooks"]["PermissionRequest"]
            .as_array_of_tables()
            .unwrap();
        assert_eq!(perm.len(), 1);
        let command = perm.get(0).unwrap()["hooks"]
            .as_array_of_tables()
            .unwrap()
            .get(0)
            .unwrap()["command"]
            .as_str()
            .unwrap();
        assert!(command.contains("codex-hook"));
    }
}
