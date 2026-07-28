//! Agent status derived from PTY output. The per-provider heuristic that reads a chunk of terminal
//! text lives behind `Provider::parse_status`; this module only holds the dedup state wrapper that
//! turns a stream of parsed signals into change events.

pub mod state;
