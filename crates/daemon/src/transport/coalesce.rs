//! Batching for a stream of small text chunks (terminal output, streaming chat text) that costs no
//! latency when the stream is quiet.

use std::time::{Duration, Instant};

/// Merges chunks that arrive in quick succession. The first chunk after a quiet spell is passed
/// straight through, so a single keystroke echo or the first token of a reply is never held back;
/// chunks that follow within `window` of the last send are joined and released together when the
/// window ends. A burst therefore becomes about one frame per window instead of one per chunk.
pub struct Coalescer {
    window: Duration,
    /// When text was last released.
    last: Option<Instant>,
    pending: String,
    /// Release early once this much has built up, so one frame never grows without bound.
    max_pending: usize,
}

impl Coalescer {
    pub fn new(window: Duration, max_pending: usize) -> Self {
        Self {
            window,
            last: None,
            pending: String::new(),
            max_pending,
        }
    }

    /// Offers a chunk. Returns text to send right now, or `None` if it was held for the window.
    pub fn push(&mut self, chunk: &str, now: Instant) -> Option<String> {
        let quiet = self
            .last
            .is_none_or(|last| now.duration_since(last) >= self.window);
        if quiet && self.pending.is_empty() {
            self.last = Some(now);
            return Some(chunk.to_string());
        }
        self.pending.push_str(chunk);
        if self.pending.len() >= self.max_pending {
            return self.take(now);
        }
        None
    }

    /// When the held text is due, if any is held.
    pub fn deadline(&self) -> Option<Instant> {
        if self.pending.is_empty() {
            return None;
        }
        Some(
            self.last
                .map_or_else(Instant::now, |last| last + self.window),
        )
    }

    /// Releases the held text (call when the deadline passes).
    pub fn take(&mut self, now: Instant) -> Option<String> {
        if self.pending.is_empty() {
            return None;
        }
        self.last = Some(now);
        Some(std::mem::take(&mut self.pending))
    }

    /// Drops the held text: something replaced the stream (a reset or a fresh snapshot).
    pub fn clear(&mut self) {
        self.pending.clear();
    }
}

/// Waits until `deadline`, or forever when there is none. For a `select!` branch that should only
/// fire while something is waiting to be flushed.
pub async fn until(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline.into()).await,
        None => std::future::pending().await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WINDOW: Duration = Duration::from_millis(5);

    #[test]
    fn the_first_chunk_after_quiet_goes_straight_through() {
        let mut coalescer = Coalescer::new(WINDOW, 1024);
        let start = Instant::now();
        assert_eq!(coalescer.push("a", start), Some("a".into()));
        assert_eq!(coalescer.deadline(), None);
        // Quiet again once a full window has passed.
        assert_eq!(coalescer.push("b", start + WINDOW), Some("b".into()));
    }

    #[test]
    fn a_burst_is_held_and_released_as_one() {
        let mut coalescer = Coalescer::new(WINDOW, 1024);
        let start = Instant::now();
        assert_eq!(coalescer.push("a", start), Some("a".into()));
        assert_eq!(coalescer.push("b", start + Duration::from_millis(1)), None);
        assert_eq!(coalescer.push("c", start + Duration::from_millis(2)), None);
        assert_eq!(coalescer.deadline(), Some(start + WINDOW));

        assert_eq!(coalescer.take(start + WINDOW), Some("bc".into()));
        assert_eq!(coalescer.deadline(), None);
        assert_eq!(coalescer.take(start + WINDOW), None);
    }

    #[test]
    fn a_chunk_arriving_while_text_is_held_keeps_its_order() {
        let mut coalescer = Coalescer::new(WINDOW, 1024);
        let start = Instant::now();
        coalescer.push("a", start);
        coalescer.push("b", start + Duration::from_millis(1));
        // The window has passed but "b" has not been released yet: "c" must queue behind it.
        assert_eq!(coalescer.push("c", start + WINDOW * 2), None);
        assert_eq!(coalescer.take(start + WINDOW * 2), Some("bc".into()));
    }

    #[test]
    fn held_text_is_released_early_once_it_is_large() {
        let mut coalescer = Coalescer::new(WINDOW, 4);
        let start = Instant::now();
        coalescer.push("a", start);
        assert_eq!(coalescer.push("bb", start), None);
        assert_eq!(coalescer.push("cc", start), Some("bbcc".into()));
    }

    #[test]
    fn clear_drops_what_was_held() {
        let mut coalescer = Coalescer::new(WINDOW, 1024);
        let start = Instant::now();
        coalescer.push("a", start);
        coalescer.push("b", start);
        coalescer.clear();
        assert_eq!(coalescer.deadline(), None);
        assert_eq!(coalescer.take(start + WINDOW), None);
    }
}
