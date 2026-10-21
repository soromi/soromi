//! The conversations Claude keeps for a folder, one `<id>.jsonl` each, as a list of earlier ones
//! shows them: named by the title they were given (`/rename`) or else their first prompt, with the
//! last thing asked. And a search through what was said in one.

use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::LazyLock;

use serde_json::Value;
use soromi_protocol::ChatEvent;

use super::transcript;
use crate::providers::Conversation;

/// How far into a conversation its first prompt is looked for. It is near the top; what comes
/// before it is a few lines of settings.
const HEAD_BYTES: u64 = 512 * 1024;
/// How much of its end is read for its latest title and prompt, which Claude writes down again
/// as the conversation goes on.
const TAIL_BYTES: u64 = 256 * 1024;
/// How much of a title or a prompt is kept, for a line in a list.
const TITLE_CHARS: usize = 120;
const PROMPT_CHARS: usize = 240;

/// The conversations kept in a project folder, in no particular order. One in which nothing was
/// asked yet (a tab opened and left) is not one to pick up again.
pub fn list(project: &Path) -> Vec<Conversation> {
    let Ok(entries) = std::fs::read_dir(project) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| read(&entry.path()))
        .collect()
}

/// One conversation, from its file.
pub fn read(path: &Path) -> Option<Conversation> {
    if path.extension()? != "jsonl" {
        return None;
    }
    let id = path.file_stem()?.to_str()?.to_string();
    // The agents a conversation set going kept theirs beside it in builds that did not file them
    // under it: theirs, not the person's.
    if id.starts_with("agent-") {
        return None;
    }
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() == 0 {
        return None;
    }
    let head = head(path)?;
    let tail = tail(path, meta.len());
    let first = head.first_prompt.clone();
    let title = tail
        .title
        .or(head.title)
        .or_else(|| first.clone())
        .map(|title| clip(&title, TITLE_CHARS))?;
    let last_prompt = tail
        .last_prompt
        .filter(|last| Some(last) != first.as_ref())
        .map(|last| clip(&last, PROMPT_CHARS));
    Some(Conversation {
        id,
        title,
        last_prompt,
        updated: meta.modified().ok()?,
        path: path.to_path_buf(),
    })
}

/// Whether something said in the conversation, by the person or by Claude, matches `query`. Each
/// line is looked at as it is first; only one that matches is read for what it says, so going
/// through a long conversation is quick.
pub fn mentions(path: &Path, query: &regex::bytes::Regex) -> bool {
    let Ok(file) = File::open(path) else {
        return false;
    };
    let reader = BufReader::with_capacity(1 << 16, file);
    for line in reader.split(b'\n') {
        let Ok(line) = line else {
            return false;
        };
        if !query.is_match(&line) {
            continue;
        }
        let Ok(text) = std::str::from_utf8(&line) else {
            continue;
        };
        let said = transcript::parse_line(text)
            .into_iter()
            .any(|event| match event {
                ChatEvent::User { text, .. } | ChatEvent::Assistant { text } => {
                    query.is_match(text.as_bytes())
                }
                _ => false,
            });
        if said || named(text).is_some_and(|title| query.is_match(title.as_bytes())) {
            return true;
        }
    }
    false
}

/// What the top of a conversation says.
#[derive(Default)]
struct Head {
    first_prompt: Option<String>,
    /// The summary builds before titles wrote at the top.
    title: Option<String>,
}

fn head(path: &Path) -> Option<Head> {
    let file = File::open(path).ok()?;
    let mut found = Head::default();
    for line in BufReader::new(file.take(HEAD_BYTES)).lines() {
        let Ok(line) = line else {
            break;
        };
        if found.title.is_none() {
            found.title = named(&line);
        }
        let prompt = transcript::parse_line(&line)
            .into_iter()
            .find_map(|event| match event {
                ChatEvent::User { text, .. } if !text.trim().is_empty() => Some(text),
                _ => None,
            });
        if prompt.is_some() {
            found.first_prompt = prompt;
            break;
        }
    }
    Some(found)
}

/// What the end of a conversation says: the latest of its titles and of its prompts.
#[derive(Default)]
struct Tail {
    title: Option<String>,
    last_prompt: Option<String>,
}

fn tail(path: &Path, len: u64) -> Tail {
    let mut found = Tail::default();
    let Ok(mut file) = File::open(path) else {
        return found;
    };
    let start = len.saturating_sub(TAIL_BYTES);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return found;
    }
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return found;
    }
    let text = String::from_utf8_lossy(&bytes);
    let mut lines = text.lines();
    // Read from partway through the file, the first line is only the end of one.
    if start > 0 {
        lines.next();
    }
    for line in lines {
        if line.contains("\"custom-title\"")
            && let Some(title) = named(line)
        {
            found.title = Some(title);
        } else if line.contains("\"last-prompt\"")
            && let Some(prompt) = last_prompt(line)
        {
            found.last_prompt = Some(prompt);
        }
    }
    found
}

/// The name a line gives the conversation: a title it was given, or a summary of it.
fn named(line: &str) -> Option<String> {
    if !line.contains("\"custom-title\"") && !line.contains("\"summary\"") {
        return None;
    }
    let value: Value = serde_json::from_str(line).ok()?;
    let field = match value.get("type")?.as_str()? {
        "custom-title" => "customTitle",
        "summary" => "summary",
        _ => return None,
    };
    text_of(&value, field)
}

fn last_prompt(line: &str) -> Option<String> {
    let value: Value = serde_json::from_str(line).ok()?;
    if value.get("type")?.as_str()? != "last-prompt" {
        return None;
    }
    text_of(&value, "lastPrompt")
}

fn text_of(value: &Value, field: &str) -> Option<String> {
    let text = value.get(field)?.as_str()?.trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// What Claude writes into a prompt around what was in it: the wrapper of pasted text and the
/// marks where pictures were. Not words of the person's.
static MARKS: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"</?pasted_content[^>]*>|\[Image #\d+\]").expect("a valid pattern")
});

/// A title or prompt as one line of a list: its words alone, on one line, and at most `max`
/// characters.
fn clip(text: &str, max: usize) -> String {
    let words = MARKS.replace_all(text, " ");
    let line = words.split_whitespace().collect::<Vec<_>>().join(" ");
    match line.char_indices().nth(max) {
        Some((end, _)) => format!("{}…", line[..end].trim_end()),
        None => line,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, id: &str, lines: &[&str]) -> std::path::PathBuf {
        let path = dir.join(format!("{id}.jsonl"));
        std::fs::write(&path, lines.join("\n") + "\n").unwrap();
        path
    }

    const SETTINGS: &str = r#"{"type":"mode","mode":"normal","sessionId":"c1"}"#;

    fn prompt(text: &str) -> String {
        format!(
            r#"{{"type":"user","message":{{"role":"user","content":[{{"type":"text","text":"{text}"}}]}}}}"#
        )
    }

    fn reply(text: &str) -> String {
        format!(
            r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"text","text":"{text}"}}]}}}}"#
        )
    }

    #[test]
    fn a_conversation_is_named_by_its_first_prompt_and_says_its_last() {
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "c1",
            &[
                SETTINGS,
                r#"{"type":"user","message":{"role":"user","content":"<command-name>/model</command-name>"}}"#,
                &prompt("Fix the   login\\nbug"),
                &reply("Done."),
                r#"{"type":"last-prompt","lastPrompt":"now add a test","sessionId":"c1"}"#,
            ],
        );

        let found = list(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "c1");
        // A slash command is not a prompt, and a title is on one line.
        assert_eq!(found[0].title, "Fix the login bug");
        assert_eq!(found[0].last_prompt.as_deref(), Some("now add a test"));
    }

    #[test]
    fn a_title_it_was_given_wins_and_the_latest_one_counts() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(
            dir.path(),
            "c1",
            &[
                SETTINGS,
                &prompt("hello"),
                r#"{"type":"custom-title","customTitle":"first name","sessionId":"c1"}"#,
                r#"{"type":"custom-title","customTitle":"login work","sessionId":"c1"}"#,
                r#"{"type":"last-prompt","lastPrompt":"hello","sessionId":"c1"}"#,
            ],
        );

        let found = read(&path).unwrap();
        assert_eq!(found.title, "login work");
        // The last prompt is the first one: nothing more to say.
        assert_eq!(found.last_prompt, None);
    }

    #[test]
    fn a_conversation_with_nothing_asked_and_an_agents_own_are_left_out() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "c1", &[SETTINGS]);
        write(dir.path(), "agent-a1", &[&prompt("look around")]);
        std::fs::write(dir.path().join("c2.jsonl"), "").unwrap();
        std::fs::write(dir.path().join("notes.txt"), prompt("x")).unwrap();

        assert!(list(dir.path()).is_empty());
        assert!(list(&dir.path().join("missing")).is_empty());
    }

    #[test]
    fn a_long_title_is_cut_at_its_length_and_claudes_marks_are_left_out() {
        assert_eq!(clip(&"a".repeat(130), 120).chars().count(), 121);
        assert_eq!(clip("short", 120), "short");
        assert_eq!(clip("[Image #1] delete those", 120), "delete those");
        assert_eq!(
            clip(
                "<pasted_content id=\"e63d\">\npnpm -v\n</pasted_content> why?",
                120
            ),
            "pnpm -v why?"
        );
    }

    #[test]
    fn a_search_finds_what_was_said_not_what_a_tool_returned() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(
            dir.path(),
            "c1",
            &[
                SETTINGS,
                &prompt("Fix the Login bug"),
                &reply("The session cookie expired."),
                r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"stripe webhook secret"}]}}"#,
            ],
        );
        let query = |text: &str| {
            regex::bytes::RegexBuilder::new(&regex::escape(text))
                .case_insensitive(true)
                .build()
                .unwrap()
        };

        assert!(mentions(&path, &query("login")));
        assert!(mentions(&path, &query("COOKIE")));
        assert!(!mentions(&path, &query("stripe")));
        assert!(!mentions(&path, &query("nowhere")));
    }
}
