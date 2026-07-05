//! The Soromi daemon: owns PTYs and workspaces, speaks the protocol over a local socket.
//!
//! Ported from the Node/TS daemon (Decision #6). This module tree mirrors the TS domain
//! layout so the two can be diffed during the migration.

pub mod accounts;
pub mod config;
pub mod files;
pub mod home;
pub mod hooks;
pub mod keep_awake;
pub mod notifications;
pub mod sessions;
pub mod sound;
pub mod status;
pub mod transport;
pub mod workspaces;
