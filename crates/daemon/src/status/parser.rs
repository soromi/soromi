use std::sync::LazyLock;

use regex::Regex;
use soromi_protocol::Status;

/// First-pass heuristic status parser for the `claude` agent. Small and pluggable; real
/// per-agent signal detection lands later. Returns `None` when a chunk carries no signal.
pub fn parse_status(chunk: &str) -> Option<Status> {
    let text = chunk.to_lowercase();
    if PROMPT.is_match(&text) {
        return Some(Status::WaitingInput);
    }
    if FAILURE.is_match(&text) {
        return Some(Status::Blocked);
    }
    if WORKING.is_match(&text) {
        return Some(Status::Thinking);
    }
    if FINISHED.is_match(&text) {
        return Some(Status::Done);
    }
    None
}

static PROMPT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\(y/n\)|\[y/n\]|allow .*\?").unwrap());
static FAILURE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\berror\b|\bfailed\b|\bblocked\b").unwrap());
static WORKING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bthinking\b|\breading\b|\bediting\b|\brunning\b").unwrap());
static FINISHED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bdone\b|\bpassed\b|\bcompleted\b").unwrap());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_permission_prompt_as_waiting_input() {
        assert_eq!(
            parse_status("? Allow write to kazomi-api/src/assembler.ts? (y/n)"),
            Some(Status::WaitingInput)
        );
    }

    #[test]
    fn reads_work_in_progress_output_as_thinking() {
        assert_eq!(
            parse_status("Reading kazomi-api/src/assembler.ts…"),
            Some(Status::Thinking)
        );
    }

    #[test]
    fn reads_a_failure_as_blocked() {
        assert_eq!(parse_status("Error: command failed"), Some(Status::Blocked));
    }

    #[test]
    fn returns_none_for_output_with_no_status_signal() {
        assert_eq!(parse_status("the quick brown fox"), None);
    }
}
