//! The assistant message streaming in for a headless chat session, token by token. It is not part of
//! the chat log — the complete message commits there — so this holds only the in-progress text and
//! tells viewers how it grows.

use std::sync::Mutex;

use tokio::sync::broadcast;

/// One step of the live message, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeltaFrame {
    /// Text to add to the end of the live message.
    Append(String),
    /// The live message is gone: it committed as a chat event, or the turn ended.
    Reset,
}

/// The in-progress text plus a feed of how it changes. Every change is published while the text is
/// locked, so a viewer that takes the text and a receiver together ([`DeltaStream::attach`]) sees
/// each later change exactly once — nothing missed, nothing doubled.
pub struct DeltaStream {
    partial: Mutex<String>,
    tx: broadcast::Sender<DeltaFrame>,
}

impl DeltaStream {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self {
            partial: Mutex::new(String::new()),
            tx,
        }
    }

    /// Adds `text` to the live message and tells viewers about just that piece.
    pub fn append(&self, text: &str) {
        if text.is_empty() {
            return;
        }
        if let Ok(mut partial) = self.partial.lock() {
            partial.push_str(text);
            let _ = self.tx.send(DeltaFrame::Append(text.to_string()));
        }
    }

    /// Drops the live message, if there is one, and tells viewers it is gone.
    pub fn reset(&self) {
        if let Ok(mut partial) = self.partial.lock() {
            if partial.is_empty() {
                return;
            }
            partial.clear();
            let _ = self.tx.send(DeltaFrame::Reset);
        }
    }

    /// The text so far and a receiver for every change after it, taken together.
    pub fn attach(&self) -> (String, broadcast::Receiver<DeltaFrame>) {
        match self.partial.lock() {
            Ok(partial) => (partial.clone(), self.tx.subscribe()),
            Err(_) => (String::new(), self.tx.subscribe()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_publish_only_the_new_piece() {
        let stream = DeltaStream::new(8);
        let (text, mut rx) = stream.attach();
        assert_eq!(text, "");

        stream.append("Hel");
        stream.append("lo");

        assert_eq!(rx.try_recv().unwrap(), DeltaFrame::Append("Hel".into()));
        assert_eq!(rx.try_recv().unwrap(), DeltaFrame::Append("lo".into()));
    }

    #[test]
    fn a_late_viewer_gets_the_text_so_far_then_only_what_follows() {
        let stream = DeltaStream::new(8);
        stream.append("Hel");

        let (text, mut rx) = stream.attach();
        assert_eq!(text, "Hel");
        stream.append("lo");

        // The piece that was already in the snapshot is not delivered again.
        assert_eq!(rx.try_recv().unwrap(), DeltaFrame::Append("lo".into()));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn reset_clears_the_text_and_is_silent_when_already_empty() {
        let stream = DeltaStream::new(8);
        let (_, mut rx) = stream.attach();

        stream.reset();
        assert!(rx.try_recv().is_err(), "nothing was streaming");

        stream.append("Hi");
        stream.reset();
        assert_eq!(rx.try_recv().unwrap(), DeltaFrame::Append("Hi".into()));
        assert_eq!(rx.try_recv().unwrap(), DeltaFrame::Reset);
        assert_eq!(stream.attach().0, "");
    }
}
