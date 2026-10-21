//! Follows an agent's on-disk transcript and turns each appended line into structured chat events.
//! The tailer here is provider-agnostic: it handles the file lifecycle (appears late, gets
//! truncated/replaced on a new conversation) and delegates line parsing to the session's provider
//! via `Provider::parse_transcript_line`.

use std::collections::HashSet;

use soromi_protocol::ChatEvent;

use crate::providers::{Provider, TaskSignal};

pub mod tailer;

/// Reads a transcript a line at a time and gives each entry's chat events once.
///
/// A provider may write an entry more than once (see `Provider::transcript_entry_id`). The first
/// time is when it happened; a later copy is skipped, so the events come out in the order of the
/// conversation and nothing old is taken for new.
pub struct Reader<'p> {
    provider: Option<&'p dyn Provider>,
    seen: HashSet<String>,
}

impl<'p> Reader<'p> {
    /// A reader for `provider`'s format. With no provider there is no format to read, and every
    /// line yields nothing.
    pub fn new(provider: Option<&'p dyn Provider>) -> Self {
        Self {
            provider,
            seen: HashSet::new(),
        }
    }

    /// The chat events of the entry on `line`, or none if that entry was read before.
    pub fn read(&mut self, line: &str) -> Vec<ChatEvent> {
        self.read_with_tasks(line).0
    }

    /// The chat events of the entry on `line`, with what it says about agents running in the
    /// background; nothing of either if that entry was read before.
    pub fn read_with_tasks(&mut self, line: &str) -> (Vec<ChatEvent>, Vec<TaskSignal>) {
        let Some(provider) = self.provider else {
            return Default::default();
        };
        if self.is_repeat(provider, line) {
            return Default::default();
        }
        (
            provider.parse_transcript_line(line),
            provider.task_signals(line),
        )
    }

    /// Whether the entry on `line` was seen before; notes it if not.
    fn is_repeat(&mut self, provider: &dyn Provider, line: &str) -> bool {
        match provider.transcript_entry_id(line) {
            Some(id) if self.seen.contains(id) => true,
            Some(id) => {
                self.seen.insert(id.to_string());
                false
            }
            None => false,
        }
    }

    /// Forgets what has been read: the transcript was replaced and is being read from the top.
    pub fn restart(&mut self) {
        self.seen.clear();
    }
}

/// The lines of a whole transcript that hold an entry for the first time, in order: the
/// conversation as it went, without the copies. The lines are not parsed, so a caller that only
/// wants the end of the conversation can parse from the back and stop early.
pub fn entries<'a>(contents: &'a str, provider: &dyn Provider) -> Vec<&'a str> {
    let mut reader = Reader::new(Some(provider));
    contents
        .lines()
        .filter(|line| !reader.is_repeat(provider, line))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claude() -> &'static dyn Provider {
        crate::providers::provider("claude").expect("claude provider")
    }

    fn said(id: &str, parent: &str, role: &str, text: &str) -> String {
        let content = match role {
            "assistant" => format!(r#"[{{"type":"text","text":"{text}"}}]"#),
            _ => format!(r#""{text}""#),
        };
        format!(
            r#"{{"parentUuid":"{parent}","type":"{role}","message":{{"role":"{role}","content":{content}}},"uuid":"{id}"}}"#
        )
    }

    fn texts(events: &[ChatEvent]) -> Vec<&str> {
        events
            .iter()
            .filter_map(|event| match event {
                ChatEvent::User { text, .. } | ChatEvent::Assistant { text } => Some(text.as_str()),
                _ => None,
            })
            .collect()
    }

    /// A transcript as Claude leaves it after compacting: the kept messages written again, with
    /// new parents, after everything that was said since.
    fn compacted() -> String {
        [
            said("u1", "", "user", "first question"),
            said("a1", "u1", "assistant", "first answer"),
            said("u2", "a1", "user", "second question"),
            said("a2", "u2", "assistant", "the latest answer"),
            // Bookkeeping lines carry no id and are never mistaken for repeats of one another.
            r#"{"type":"mode","mode":"default"}"#.to_string(),
            r#"{"type":"mode","mode":"default"}"#.to_string(),
            // The copies.
            said("u1", "boundary", "user", "first question"),
            said("a1", "u1", "assistant", "first answer"),
            said("u3", "a2", "user", "after compacting"),
        ]
        .join("\n")
    }

    #[test]
    fn an_entry_written_again_is_read_once_where_it_first_appeared() {
        let transcript = compacted();
        let mut reader = Reader::new(Some(claude()));
        let events: Vec<ChatEvent> = transcript
            .lines()
            .flat_map(|line| reader.read(line))
            .collect();
        assert_eq!(
            texts(&events),
            [
                "first question",
                "first answer",
                "second question",
                "the latest answer",
                "after compacting"
            ]
        );
    }

    #[test]
    fn the_end_of_the_conversation_is_its_last_new_entry_not_the_last_line() {
        let transcript = compacted();
        // Drop the message said after compacting: the file now ends with copies of old messages.
        let transcript = transcript.rsplit_once('\n').unwrap().0;
        let lines = entries(transcript, claude());
        let last = lines
            .iter()
            .rev()
            .flat_map(|line| claude().parse_transcript_line(line))
            .next();
        assert_eq!(
            last,
            Some(ChatEvent::Assistant {
                text: "the latest answer".into()
            })
        );
    }

    #[test]
    fn a_reader_started_over_reads_a_replaced_transcript_from_the_top() {
        let line = said("u1", "", "user", "hello");
        let mut reader = Reader::new(Some(claude()));
        assert_eq!(reader.read(&line).len(), 1);
        assert_eq!(reader.read(&line).len(), 0);
        reader.restart();
        assert_eq!(reader.read(&line).len(), 1);
    }

    #[test]
    fn with_no_provider_nothing_is_read() {
        let mut reader = Reader::new(None);
        assert!(reader.read(&said("u1", "", "user", "hello")).is_empty());
    }

    #[test]
    fn the_id_is_read_without_building_the_entry() {
        let provider = claude();
        assert_eq!(
            provider.transcript_entry_id(&said("abc-123", "", "user", "hi")),
            Some("abc-123")
        );
        assert_eq!(
            provider.transcript_entry_id(r#"{"type":"mode","mode":"default"}"#),
            None
        );
        assert_eq!(provider.transcript_entry_id("not json"), None);
    }
}
