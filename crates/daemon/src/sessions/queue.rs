//! The messages chat sessions hold back while their agent is at work. One typed mid-turn and queued,
//! rather than sent (which steers the running turn), goes out as a turn of its own once the one
//! before it ends. Kept in memory only: a restarted daemon starts with none.

use std::collections::{HashMap, VecDeque};

use soromi_protocol::{ChatFile, QueuedTurn};

/// How much of a queued message a session's summary carries, for showing it.
const PREVIEW_CHARS: usize = 300;

/// One queued message, with everything that goes with it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Queued {
    pub id: String,
    pub text: String,
    pub files: Vec<ChatFile>,
}

/// One session's queue.
#[derive(Debug, Default)]
struct Queue {
    turns: VecDeque<Queued>,
    /// Held after a stop: nothing goes out on its own until another turn is sent and ends.
    paused: bool,
}

/// Every chat session's queue, by session id.
#[derive(Debug, Default)]
pub struct TurnQueues {
    queues: HashMap<String, Queue>,
}

impl TurnQueues {
    /// Adds a message at the end of a session's queue, and returns its id.
    pub fn push(&mut self, session: &str, text: String, files: Vec<ChatFile>) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.queues
            .entry(session.to_string())
            .or_default()
            .turns
            .push_back(Queued {
                id: id.clone(),
                text,
                files,
            });
        id
    }

    /// Takes one message out, by its id.
    pub fn take(&mut self, session: &str, id: &str) -> Option<Queued> {
        let queue = self.queues.get_mut(session)?;
        let at = queue.turns.iter().position(|turn| turn.id == id)?;
        let turn = queue.turns.remove(at);
        self.tidy(session);
        turn
    }

    /// The message to send now that a turn has ended: the oldest, unless the queue is held.
    pub fn next(&mut self, session: &str) -> Option<Queued> {
        let queue = self.queues.get_mut(session)?;
        if queue.paused {
            return None;
        }
        let turn = queue.turns.pop_front();
        self.tidy(session);
        turn
    }

    /// Holds the queue: the turn was stopped, which is no time to send the next one. Returns
    /// whether that changed anything.
    pub fn pause(&mut self, session: &str) -> bool {
        match self.queues.get_mut(session) {
            Some(queue) if !queue.paused => {
                queue.paused = true;
                true
            }
            _ => false,
        }
    }

    /// Lets a held queue go again: a turn was sent, and the queue follows it once it ends. Returns
    /// whether that changed anything.
    pub fn resume(&mut self, session: &str) -> bool {
        match self.queues.get_mut(session) {
            Some(queue) if queue.paused => {
                queue.paused = false;
                true
            }
            _ => false,
        }
    }

    /// Drops a session's queue: it closed, or no longer takes chat turns. Returns whether there
    /// was anything in it.
    pub fn forget(&mut self, session: &str) -> bool {
        self.queues.remove(session).is_some()
    }

    /// What a session's summary shows of its queue: each message's start, oldest first, and
    /// whether the queue is held.
    pub fn summary(&self, session: &str) -> (Vec<QueuedTurn>, bool) {
        let Some(queue) = self.queues.get(session) else {
            return (Vec::new(), false);
        };
        let turns = queue
            .turns
            .iter()
            .map(|turn| QueuedTurn {
                id: turn.id.clone(),
                text: preview(&turn.text),
                files: u32::try_from(turn.files.len()).unwrap_or(u32::MAX),
            })
            .collect();
        (turns, queue.paused)
    }

    /// An emptied queue is not kept, so it is not held for the next message either.
    fn tidy(&mut self, session: &str) {
        if self
            .queues
            .get(session)
            .is_some_and(|queue| queue.turns.is_empty())
        {
            self.queues.remove(session);
        }
    }
}

fn preview(text: &str) -> String {
    match text.char_indices().nth(PREVIEW_CHARS) {
        Some((end, _)) => format!("{}…", text[..end].trim_end()),
        None => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_go_out_oldest_first_and_one_can_be_taken_out_of_turn() {
        let mut queues = TurnQueues::default();
        let first = queues.push("s1", "first".into(), Vec::new());
        let second = queues.push("s1", "second".into(), Vec::new());
        queues.push("s1", "third".into(), Vec::new());

        assert_eq!(queues.take("s1", &second).unwrap().text, "second");
        assert_eq!(queues.next("s1").unwrap().id, first);
        assert_eq!(queues.next("s1").unwrap().text, "third");
        assert_eq!(queues.next("s1"), None);
        assert_eq!(queues.summary("s1"), (Vec::new(), false));
    }

    #[test]
    fn a_stopped_turn_holds_the_queue_until_it_is_let_go() {
        let mut queues = TurnQueues::default();
        queues.push("s1", "next".into(), Vec::new());

        assert!(queues.pause("s1"));
        assert_eq!(queues.next("s1"), None);
        assert!(queues.summary("s1").1);
        assert!(queues.resume("s1"));
        assert_eq!(queues.next("s1").unwrap().text, "next");
        // Nothing queued: nothing to hold.
        assert!(!queues.pause("s1"));
    }

    #[test]
    fn a_summary_shows_the_start_of_a_long_message_and_counts_its_files() {
        let mut queues = TurnQueues::default();
        let file = ChatFile {
            media_type: "image/png".into(),
            data: String::new(),
            filename: Some("a.png".into()),
            deferred: false,
        };
        queues.push("s1", "x".repeat(PREVIEW_CHARS + 50), vec![file]);

        let (turns, paused) = queues.summary("s1");
        assert!(!paused);
        assert_eq!(turns[0].files, 1);
        assert_eq!(turns[0].text.chars().count(), PREVIEW_CHARS + 1);
        assert!(turns[0].text.ends_with('…'));
        assert!(queues.forget("s1"));
        assert!(!queues.forget("s1"));
    }
}
