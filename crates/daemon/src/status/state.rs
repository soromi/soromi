use soromi_protocol::Status;

use super::parser::parse_status;

/// Tracks the current agent status derived from PTY output. Holds the last known status and
/// only reports a change when a new signal differs from it.
pub struct StatusState {
    current: Status,
}

impl StatusState {
    pub fn new() -> Self {
        Self {
            current: Status::Idle,
        }
    }

    pub fn with_initial(initial: Status) -> Self {
        Self { current: initial }
    }

    pub fn get(&self) -> Status {
        self.current
    }

    /// Feeds an output chunk; returns the new status if it changed, else `None`.
    pub fn update(&mut self, chunk: &str) -> Option<Status> {
        let parsed = parse_status(chunk)?;
        if parsed == self.current {
            return None;
        }
        self.current = parsed;
        Some(parsed)
    }
}

impl Default for StatusState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_idle_by_default() {
        assert_eq!(StatusState::new().get(), Status::Idle);
    }

    #[test]
    fn reports_a_change_when_the_parsed_status_differs() {
        let mut state = StatusState::new();
        assert_eq!(state.update("Reading the file"), Some(Status::Thinking));
        assert_eq!(state.get(), Status::Thinking);
    }

    #[test]
    fn returns_none_when_the_status_is_unchanged() {
        let mut state = StatusState::new();
        state.update("Reading the file");
        assert_eq!(state.update("Editing the file"), None);
    }

    #[test]
    fn returns_none_for_output_with_no_signal() {
        assert_eq!(StatusState::new().update("the quick brown fox"), None);
    }

    #[test]
    fn transitions_between_states() {
        let mut state = StatusState::new();
        assert_eq!(state.update("Reading"), Some(Status::Thinking));
        assert_eq!(
            state.update("Allow write? (y/n)"),
            Some(Status::WaitingInput)
        );
    }
}
