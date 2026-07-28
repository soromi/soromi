use soromi_protocol::Status;

/// Tracks the current agent status derived from PTY output. Holds the last known status and
/// only reports a change when a new signal differs from it. The signal itself is produced by the
/// session's provider (`Provider::parse_status`); this wrapper is provider-agnostic dedup.
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

    /// Feeds the provider's parsed signal for a chunk (`None` when the chunk carried none); returns
    /// the new status only if it changed.
    pub fn update(&mut self, parsed: Option<Status>) -> Option<Status> {
        let parsed = parsed?;
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
        assert_eq!(state.update(Some(Status::Thinking)), Some(Status::Thinking));
        assert_eq!(state.get(), Status::Thinking);
    }

    #[test]
    fn returns_none_when_the_status_is_unchanged() {
        let mut state = StatusState::new();
        state.update(Some(Status::Thinking));
        assert_eq!(state.update(Some(Status::Thinking)), None);
    }

    #[test]
    fn returns_none_for_a_chunk_with_no_signal() {
        assert_eq!(StatusState::new().update(None), None);
    }

    #[test]
    fn transitions_between_states() {
        let mut state = StatusState::new();
        assert_eq!(state.update(Some(Status::Thinking)), Some(Status::Thinking));
        assert_eq!(
            state.update(Some(Status::WaitingInput)),
            Some(Status::WaitingInput)
        );
    }
}
