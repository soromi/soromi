//! Where Claude keeps a background agent's own conversation. Beside each conversation's transcript
//! (`<id>.jsonl`) is a folder of the same name with one log per agent it started:
//! `<id>/subagents/agent-<agent id>.jsonl`, and next to it `agent-<agent id>.meta.json`, which says
//! which tool call started it (`toolUseId`). An agent is listed by that call, so it is found
//! through its meta file, or by its own id when that is what it is known by.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

/// The log of the agent known as `agent` (the tool call that started it, or its own id) in the
/// conversation at `transcript`, if it has written one.
pub fn log_path(transcript: &Path, agent: &str) -> Option<PathBuf> {
    // A name made of anything but letters, digits, `-` and `_` is no id: never a path.
    if agent.is_empty()
        || !agent
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    let folder = transcript.with_extension("").join("subagents");

    let own = folder.join(format!("agent-{agent}.jsonl"));
    if own.is_file() {
        return Some(own);
    }
    fs::read_dir(&folder).ok()?.flatten().find_map(|entry| {
        let name = entry.file_name().into_string().ok()?;
        let stem = name.strip_suffix(".meta.json")?;
        let meta: Value = serde_json::from_str(&fs::read_to_string(entry.path()).ok()?).ok()?;
        (meta.get("toolUseId").and_then(Value::as_str) == Some(agent))
            .then(|| folder.join(format!("{stem}.jsonl")))
            .filter(|log| log.is_file())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_agent_is_found_by_the_call_that_started_it_or_by_its_own_id() {
        let dir = tempfile::tempdir().unwrap();
        let transcript = dir.path().join("conv-1.jsonl");
        let folder = dir.path().join("conv-1/subagents");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("agent-a1.jsonl"), "{}\n").unwrap();
        fs::write(
            folder.join("agent-a1.meta.json"),
            r#"{"agentType":"Explore","toolUseId":"toolu_1"}"#,
        )
        .unwrap();

        let log = Some(folder.join("agent-a1.jsonl"));
        assert_eq!(log_path(&transcript, "toolu_1"), log);
        assert_eq!(log_path(&transcript, "a1"), log);
        assert_eq!(log_path(&transcript, "toolu_2"), None);
        // Nothing outside the folder can be named.
        assert_eq!(log_path(&transcript, "../conv-1"), None);
        assert_eq!(log_path(&transcript, ""), None);
    }
}
