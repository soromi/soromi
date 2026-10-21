//! A session's chat transcript as viewers follow it: the events so far, each with a place in line,
//! and a feed of the ones that come after.

use std::sync::Mutex;

use soromi_protocol::{ChatCursor, ChatEvent, ChatFile};
use tokio::sync::broadcast;

/// How many live events may wait for one viewer before it is told it fell behind.
const CAPACITY: usize = 512;

/// One step of a log, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LogFrame {
    /// An event was added. `seq` is its place in the log, counting from 1.
    Event { seq: u32, event: ChatEvent },
    /// The log started over (a new or resumed conversation): everything before this is gone.
    Restarted,
}

/// What a viewer needs to be level with a log, given what it said it already holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Start {
    /// The viewer's copy is good up to its cursor: these are the events after it, the last of them
    /// number `seq`.
    Resume { events: Vec<ChatEvent>, seq: u32 },
    /// The viewer starts over: the log's id, the number of its last event, and that many of the most
    /// recent events as fit a page, with whether older ones remain.
    Reset {
        log: String,
        seq: u32,
        tail: Vec<ChatEvent>,
        has_more: bool,
    },
}

struct Inner {
    /// Names this run of the log. It changes when the log starts over, so a cursor into an earlier
    /// run is never mistaken for one into this.
    id: String,
    events: Vec<ChatEvent>,
}

/// The transcript plus a feed of how it grows. Every change is published while the transcript is
/// locked, so a viewer that takes its starting point and a receiver together ([`ChatLog::attach`])
/// sees each later event exactly once — nothing missed, nothing doubled.
pub struct ChatLog {
    inner: Mutex<Inner>,
    tx: broadcast::Sender<LogFrame>,
}

impl ChatLog {
    /// A log that starts with `seed` (a conversation being resumed), or empty.
    pub fn new(seed: Vec<ChatEvent>) -> Self {
        let (tx, _) = broadcast::channel(CAPACITY);
        Self {
            inner: Mutex::new(Inner {
                id: new_id(),
                events: seed,
            }),
            tx,
        }
    }

    /// Adds an event to the end and tells viewers.
    pub fn push(&self, event: ChatEvent) {
        self.extend(vec![event]);
    }

    /// Adds events to the end, in order, and tells viewers about each.
    pub fn extend(&self, events: Vec<ChatEvent>) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        for event in events {
            // With nobody following (a transcript being read in at startup, say) there is no copy
            // to make.
            if self.tx.receiver_count() > 0 {
                let _ = self.tx.send(LogFrame::Event {
                    seq: inner.events.len() as u32 + 1,
                    event: for_viewer(&event),
                });
            }
            inner.events.push(event);
        }
    }

    /// Empties the log for a new conversation and tells viewers theirs is void.
    pub fn restart(&self) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        inner.id = new_id();
        inner.events.clear();
        let _ = self.tx.send(LogFrame::Restarted);
    }

    /// Every event so far, as recorded (file bytes included).
    pub fn snapshot(&self) -> Vec<ChatEvent> {
        self.inner
            .lock()
            .map(|inner| inner.events.clone())
            .unwrap_or_default()
    }

    /// The `count` events just before the `loaded` most recent ones (which the viewer holds as a
    /// contiguous run), plus whether older ones remain.
    pub fn earlier(&self, loaded: usize, count: usize) -> (Vec<ChatEvent>, bool) {
        let Ok(inner) = self.inner.lock() else {
            return (Vec::new(), false);
        };
        let oldest = inner.events.len().saturating_sub(loaded);
        let start = oldest.saturating_sub(count);
        (replay(&inner.events[start..oldest]), start > 0)
    }

    /// Where a viewer starts, and a receiver for every change after that point, taken together.
    ///
    /// A viewer whose `cursor` points into this run of the log, no more than `page` events behind,
    /// is sent only what it is missing. Any other viewer — no cursor, a cursor into an earlier run,
    /// or one too far behind to be worth catching up event by event — starts over from the last
    /// `page` events.
    pub fn attach(
        &self,
        cursor: Option<&ChatCursor>,
        page: usize,
    ) -> (Start, broadcast::Receiver<LogFrame>) {
        let Ok(inner) = self.inner.lock() else {
            let start = Start::Reset {
                log: String::new(),
                seq: 0,
                tail: Vec::new(),
                has_more: false,
            };
            return (start, self.tx.subscribe());
        };
        let len = inner.events.len();
        let held = cursor
            .filter(|cursor| cursor.log == inner.id)
            .map(|cursor| cursor.seq as usize)
            .filter(|held| *held <= len && len - held <= page);
        let start = match held {
            Some(held) => Start::Resume {
                events: replay(&inner.events[held..]),
                seq: len as u32,
            },
            None => {
                let from = len.saturating_sub(page);
                Start::Reset {
                    log: inner.id.clone(),
                    seq: len as u32,
                    tail: replay(&inner.events[from..]),
                    has_more: from > 0,
                }
            }
        };
        (start, self.tx.subscribe())
    }

    /// One attached file of the event numbered `seq`, with its bytes, if `log` names this run.
    pub fn file(&self, log: &str, seq: u32, index: usize) -> Option<ChatFile> {
        let inner = self.inner.lock().ok()?;
        if inner.id != log {
            return None;
        }
        match inner.events.get((seq as usize).checked_sub(1)?)? {
            ChatEvent::User { files, .. } => files.get(index).cloned(),
            _ => None,
        }
    }
}

/// Events as they are sent to a viewer catching up.
fn replay(events: &[ChatEvent]) -> Vec<ChatEvent> {
    events.iter().map(for_viewer).collect()
}

/// A copy of an event as a viewer is sent it: with the bytes of attached files left out and each
/// file marked as deferred. A pasted image is megabytes of base64; a viewer scrolling past it has
/// no use for that, and one that shows it asks for it (`ChatFetchFile`).
fn for_viewer(event: &ChatEvent) -> ChatEvent {
    match event {
        ChatEvent::User { text, files } => ChatEvent::User {
            text: text.clone(),
            files: files
                .iter()
                .map(|file| ChatFile {
                    media_type: file.media_type.clone(),
                    data: String::new(),
                    filename: file.filename.clone(),
                    deferred: true,
                })
                .collect(),
        },
        other => other.clone(),
    }
}

/// A random id for one run of a log.
fn new_id() -> String {
    let mut bytes = [0u8; 8];
    // The id only has to differ from the last run's; a failed RNG still yields a usable (if
    // repeated) one, and a repeat costs a viewer one full re-sync at worst.
    let _ = getrandom::getrandom(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn says(text: &str) -> ChatEvent {
        ChatEvent::Assistant { text: text.into() }
    }

    fn texts(events: &[ChatEvent]) -> Vec<&str> {
        events
            .iter()
            .map(|event| match event {
                ChatEvent::Assistant { text } | ChatEvent::User { text, .. } => text.as_str(),
                _ => "",
            })
            .collect()
    }

    fn log_of(count: usize) -> ChatLog {
        ChatLog::new((1..=count).map(|n| says(&n.to_string())).collect())
    }

    /// The cursor of a viewer that holds everything up to `seq` of `log`'s current run.
    fn cursor(log: &ChatLog, seq: u32) -> ChatCursor {
        let (Start::Reset { log: id, .. }, _) = log.attach(None, 1) else {
            panic!("a viewer with no cursor starts over");
        };
        ChatCursor { log: id, seq }
    }

    #[test]
    fn a_new_viewer_starts_from_the_last_page() {
        let log = log_of(5);
        let (start, _) = log.attach(None, 3);
        let Start::Reset {
            seq,
            tail,
            has_more,
            ..
        } = start
        else {
            panic!("expected a reset");
        };
        assert_eq!(seq, 5);
        assert_eq!(texts(&tail), ["3", "4", "5"]);
        assert!(has_more);

        let (start, _) = log_of(2).attach(None, 3);
        assert!(
            matches!(start, Start::Reset { seq: 2, has_more: false, ref tail, .. } if tail.len() == 2)
        );
    }

    #[test]
    fn a_returning_viewer_is_sent_only_what_it_missed() {
        let log = log_of(5);
        let held = cursor(&log, 3);
        log.push(says("6"));

        let (start, _) = log.attach(Some(&held), 10);
        let Start::Resume { events, seq } = start else {
            panic!("expected a resume");
        };
        assert_eq!(texts(&events), ["4", "5", "6"]);
        assert_eq!(seq, 6);

        // Level already: nothing to send, and still no reset.
        let level = cursor(&log, 6);
        assert_eq!(
            log.attach(Some(&level), 10).0,
            Start::Resume {
                events: Vec::new(),
                seq: 6
            }
        );
    }

    #[test]
    fn a_viewer_too_far_behind_or_ahead_starts_over() {
        let log = log_of(10);
        let far_behind = cursor(&log, 2);
        assert!(matches!(
            log.attach(Some(&far_behind), 5).0,
            Start::Reset { seq: 10, .. }
        ));
        // A cursor past the end cannot be for this log as it stands.
        let ahead = cursor(&log, 11);
        assert!(matches!(log.attach(Some(&ahead), 5).0, Start::Reset { .. }));
    }

    #[test]
    fn a_cursor_into_an_earlier_run_starts_over() {
        let log = log_of(3);
        let old = cursor(&log, 3);
        let (_, mut rx) = log.attach(None, 10);

        log.restart();
        assert_eq!(rx.try_recv(), Ok(LogFrame::Restarted));
        log.extend(vec![says("a"), says("b"), says("c")]);

        let (start, _) = log.attach(Some(&old), 10);
        let Start::Reset { log: id, tail, .. } = start else {
            panic!("expected a reset");
        };
        assert_ne!(id, old.log);
        assert_eq!(texts(&tail), ["a", "b", "c"]);
    }

    #[test]
    fn events_after_an_attach_arrive_once_each_and_numbered() {
        let log = log_of(2);
        let (_, mut rx) = log.attach(None, 10);
        log.push(says("3"));
        log.extend(vec![says("4"), says("5")]);

        let mut seen = Vec::new();
        while let Ok(LogFrame::Event { seq, event }) = rx.try_recv() {
            seen.push((seq, event));
        }
        assert_eq!(seen, vec![(3, says("3")), (4, says("4")), (5, says("5"))]);
    }

    #[test]
    fn earlier_pages_walk_back_from_what_the_viewer_holds() {
        let log = log_of(10);
        let (page, has_more) = log.earlier(3, 4);
        assert_eq!(texts(&page), ["4", "5", "6", "7"]);
        assert!(has_more);

        let (page, has_more) = log.earlier(7, 4);
        assert_eq!(texts(&page), ["1", "2", "3"]);
        assert!(!has_more);
    }

    #[test]
    fn file_bytes_stay_in_the_log_and_are_fetched_by_place() {
        let image = ChatFile {
            media_type: "image/png".into(),
            data: "aGVsbG8=".into(),
            filename: Some("shot.png".into()),
            deferred: false,
        };
        let prompt = ChatEvent::User {
            text: "look".into(),
            files: vec![image.clone()],
        };
        let log = ChatLog::new(vec![says("1")]);
        let (_, mut rx) = log.attach(None, 10);
        log.push(prompt.clone());

        let deferred = ChatFile {
            data: String::new(),
            deferred: true,
            ..image.clone()
        };
        let stripped = ChatEvent::User {
            text: "look".into(),
            files: vec![deferred],
        };
        // Neither the live feed, a replay, nor an earlier page carries the bytes.
        assert_eq!(
            rx.try_recv(),
            Ok(LogFrame::Event {
                seq: 2,
                event: stripped.clone()
            })
        );
        let (Start::Reset { log: id, tail, .. }, _) = log.attach(None, 10) else {
            panic!("expected a reset");
        };
        assert_eq!(tail[1], stripped);
        assert_eq!(log.earlier(0, 1).0, vec![stripped]);

        // They are still in the log, for whoever asks by place.
        assert_eq!(log.snapshot()[1], prompt);
        assert_eq!(log.file(&id, 2, 0), Some(image));
        assert_eq!(log.file(&id, 2, 1), None);
        assert_eq!(log.file(&id, 1, 0), None);
        assert_eq!(log.file(&id, 0, 0), None);
        assert_eq!(log.file("another-run", 2, 0), None);
    }
}
