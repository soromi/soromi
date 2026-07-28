//! Follows an agent's on-disk transcript and turns each appended line into structured chat events.
//! The tailer here is provider-agnostic: it handles the file lifecycle (appears late, gets
//! truncated/replaced on a new conversation) and delegates line parsing to the session's provider
//! via `Provider::parse_transcript_line`.

pub mod tailer;
