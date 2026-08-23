//! Follows an agent's transcript file and hands each newly-appended, parsed line's events to a
//! sink. Polling-based (a few times a second): chat updates are not keystroke-latency sensitive,
//! polling avoids a filesystem-watch dependency, and it naturally handles the file being created
//! after the tail starts (an agent writes the transcript as the session gets going). Line parsing
//! is the provider's job, passed in as `parse` — the tailer itself is format-agnostic.

use std::path::PathBuf;
use std::time::Duration;

use soromi_protocol::ChatEvent;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

const POLL_INTERVAL: Duration = Duration::from_millis(300);

/// Follows `path`, parsing complete lines with `parse` as they are appended and passing their
/// events to `on_events`. Runs until aborted. Waits for the file to appear, and restarts from the
/// top if it is truncated or replaced (a new conversation).
pub async fn tail<P, F>(path: PathBuf, parse: P, mut on_events: F)
where
    P: Fn(&str) -> Vec<ChatEvent> + Send,
    F: FnMut(Vec<ChatEvent>) + Send,
{
    let mut offset: u64 = 0;
    let mut partial: Vec<u8> = Vec::new();

    loop {
        if let Ok(mut file) = tokio::fs::File::open(&path).await {
            let len = file.metadata().await.map(|meta| meta.len()).unwrap_or(0);
            if len < offset {
                offset = 0;
                partial.clear();
            }

            if len > offset && file.seek(std::io::SeekFrom::Start(offset)).await.is_ok() {
                let mut chunk = Vec::new();
                if let Ok(read) = file.read_to_end(&mut chunk).await {
                    offset += read as u64;
                    partial.extend_from_slice(&chunk);
                    drain_lines(&mut partial, &parse, &mut on_events);
                }
            }
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

/// Emits every complete (newline-terminated) line's events, leaving any trailing partial line
/// buffered for the next read (so a line captured mid-write is never parsed half-formed).
fn drain_lines<P, F>(partial: &mut Vec<u8>, parse: &P, on_events: &mut F)
where
    P: Fn(&str) -> Vec<ChatEvent>,
    F: FnMut(Vec<ChatEvent>),
{
    while let Some(newline) = partial.iter().position(|&byte| byte == b'\n') {
        let line: Vec<u8> = partial.drain(..=newline).collect();
        if let Ok(text) = std::str::from_utf8(&line) {
            let events = parse(text.trim_end());
            if !events.is_empty() {
                on_events(events);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drains_complete_lines_and_buffers_the_partial_tail() {
        // Parse through a real provider (Claude) to exercise the format-agnostic seam end to end.
        let parse = |line: &str| {
            crate::providers::provider("claude")
                .unwrap()
                .parse_transcript_line(line)
        };
        let mut collected: Vec<ChatEvent> = Vec::new();
        let line = |content: &str| {
            format!(r#"{{"type":"user","message":{{"role":"user","content":"{content}"}}}}"#)
        };
        // Two complete lines plus a partial third with no trailing newline.
        let mut buffer = format!("{}\n{}\n{{\"type\":\"user\"", line("a"), line("b")).into_bytes();

        drain_lines(&mut buffer, &parse, &mut |events| collected.extend(events));

        assert_eq!(
            collected,
            vec![
                ChatEvent::User { text: "a".into(), files: Vec::new() },
                ChatEvent::User { text: "b".into(), files: Vec::new() },
            ]
        );
        // The unterminated line stays buffered for the next read.
        assert_eq!(buffer, br#"{"type":"user""#);
    }
}
