//! Codex's terminal status heuristic: a coarse working/waiting signal scraped from PTY output.
//! Like Claude's, it is only a fallback — Codex's `notify` events are the authoritative source for
//! turn-complete and approval-requested — so it stays deliberately conservative, reacting only to
//! Codex's stable "working" footer and an approval prompt, and never guessing "done" from prose.

use std::sync::LazyLock;

use regex::Regex;
use soromi_protocol::Status;

/// Reads a chunk of Codex's PTY output for a status signal. Returns `None` when it carries none.
pub fn parse(chunk: &str) -> Option<Status> {
    let text = chunk.to_lowercase();
    if PROMPT.is_match(&text) {
        return Some(Status::WaitingInput);
    }
    if WORKING.is_match(&text) {
        return Some(Status::Thinking);
    }
    None
}

// Codex prompts for approval before running a command / applying a patch; it also uses a y/n prompt.
static PROMPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\(y/n\)|\[y/n\]|allow .*\?|approve .*\?|apply this .*\?").unwrap()
});
// "esc to interrupt" is Codex's working footer, shown while a turn is in flight regardless of the
// spinner text; "working" / "thinking" back it up.
static WORKING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"esc to interrupt|\bworking\b|\bthinking\b").unwrap());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_interrupt_footer_as_thinking() {
        assert_eq!(parse("Working (esc to interrupt)"), Some(Status::Thinking));
    }

    #[test]
    fn reads_an_approval_prompt_as_waiting_input() {
        assert_eq!(
            parse("Allow command `rm -rf build`? (y/n)"),
            Some(Status::WaitingInput)
        );
    }

    #[test]
    fn ignores_ordinary_prose() {
        assert_eq!(parse("the build finished with no errors"), None);
    }
}
