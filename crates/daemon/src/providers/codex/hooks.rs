use std::fs;
use std::io;
use std::path::Path;

/// Installs Soromi's Codex hooks: points `notify` at this binary (covers `agent-turn-complete`, no
/// trust needed) and adds a `PermissionRequest` hook (the request cue; needs `/hooks` trust). No
/// `Stop` hook, since `notify` already covers complete and a second would double-fire.
pub(super) fn install(config_dir: &Path) -> io::Result<()> {
    ensure_notify(config_dir)?;
    ensure_permission_hook(config_dir)
}

/// Points Codex's `notify` (in `config.toml`) at this binary as a bridge, so `agent-turn-complete`
/// reaches the daemon. Preserves the rest of the file (comments, keys) but replaces any existing
/// `notify` (Codex allows only one program). Idempotent.
fn ensure_notify(config_dir: &Path) -> io::Result<()> {
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

/// Installs Soromi's Codex `PermissionRequest` hook into `config.toml`. Codex hooks pass JSON on
/// stdin, so the command runs us as `<exe> codex-hook`. Merges non-destructively and is idempotent.
fn ensure_permission_hook(config_dir: &Path) -> io::Result<()> {
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
        .filter(|entry| !is_ours(entry))
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
fn is_ours(entry: &toml_edit::Table) -> bool {
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn notify_is_set_and_preserves_other_keys() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("config.toml"), "model = \"gpt-5\"\n").unwrap();

        install(dir.path()).unwrap();
        install(dir.path()).unwrap(); // idempotent

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
    fn permission_hook_is_idempotent_and_preserves_other_hooks() {
        let dir = tempdir().unwrap();
        // A user's own PreToolUse hook that must survive.
        fs::write(
            dir.path().join("config.toml"),
            "[[hooks.PreToolUse]]\n[[hooks.PreToolUse.hooks]]\ntype = \"command\"\ncommand = \"user-thing\"\n",
        )
        .unwrap();

        install(dir.path()).unwrap();
        install(dir.path()).unwrap(); // idempotent

        let doc: toml_edit::DocumentMut = fs::read_to_string(dir.path().join("config.toml"))
            .unwrap()
            .parse()
            .unwrap();
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
