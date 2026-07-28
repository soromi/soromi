//! Claude's terminal status heuristic: a coarse working/waiting signal scraped from PTY output.
//! It is only a fallback — Claude's hooks (UserPromptSubmit / PreToolUse / Stop / Notification)
//! are the authoritative source — so it reads just two structural signals and never guesses "done"
//! or "blocked" from prose (matching "error"/"completed" in ordinary output produced phantoms).

use std::sync::LazyLock;

use regex::Regex;
use soromi_protocol::Status;

/// Reads a chunk of Claude's PTY output for a status signal. Returns `None` when it carries none.
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

static PROMPT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\(y/n\)|\[y/n\]|allow .*\?").unwrap());
// "esc to interrupt" is Claude's stable "I'm working" footer, shown regardless of which whimsical
// spinner word ("Musing…", "Unravelling…") is animating — so it catches turns the word list misses.
static WORKING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bthinking\b|\breading\b|\bediting\b|\brunning\b|esc to interrupt").unwrap()
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_permission_prompt_as_waiting_input() {
        assert_eq!(
            parse("? Allow write to kazomi-api/src/assembler.ts? (y/n)"),
            Some(Status::WaitingInput)
        );
    }

    #[test]
    fn reads_work_in_progress_output_as_thinking() {
        assert_eq!(
            parse("Reading kazomi-api/src/assembler.ts…"),
            Some(Status::Thinking)
        );
    }

    #[test]
    fn reads_the_interrupt_footer_as_thinking_regardless_of_spinner_word() {
        // The spinner word keeps changing ("Musing", "Unravelling", ...) but the footer does not.
        assert_eq!(
            parse("✻ Musing… (5m 27s · esc to interrupt)"),
            Some(Status::Thinking)
        );
    }

    #[test]
    fn ignores_done_and_error_words_in_prose() {
        // "done" / "error" in ordinary output must not fabricate a status; hooks own those.
        assert_eq!(parse("All done — no errors, tests passed"), None);
    }

    #[test]
    fn returns_none_for_output_with_no_status_signal() {
        assert_eq!(parse("the quick brown fox"), None);
    }
}
