//! The headless chat backend, abstracted over how a provider is driven. Claude runs one persistent
//! `stream-json` process ([`StreamJsonSession`]); Codex runs one process per turn
//! ([`ExecChatSession`]). Both expose the same channels, so this enum is a thin dispatcher and the
//! transport / chat UI never learn which backend a session uses.

use tokio::sync::{broadcast, watch};

use soromi_protocol::{
    ChatEvent, ChatFile, PermissionMode, SlashCommand, Status, SubAgent, ToolApproval,
};

use super::exec_chat::ExecChatSession;
use super::stream_json::StreamJsonSession;

pub enum ChatSession {
    /// Claude: one persistent stream-json process.
    StreamJson(StreamJsonSession),
    /// Codex: one `exec` process per turn.
    Exec(ExecChatSession),
}

/// Dispatches a method to whichever backend this session is. `$self.$m(args)` on each arm.
macro_rules! dispatch {
    ($self:ident, $method:ident ( $( $arg:expr ),* )) => {
        match $self {
            ChatSession::StreamJson(s) => s.$method( $( $arg ),* ),
            ChatSession::Exec(s) => s.$method( $( $arg ),* ),
        }
    };
}

impl ChatSession {
    // ---- writes (async) -------------------------------------------------------------------------
    pub async fn send_turn(&self, text: &str, files: &[ChatFile]) {
        match self {
            ChatSession::StreamJson(s) => s.send_turn(text, files).await,
            ChatSession::Exec(s) => s.send_turn(text, files).await,
        }
    }
    pub async fn interrupt(&self) {
        match self {
            ChatSession::StreamJson(s) => s.interrupt().await,
            ChatSession::Exec(s) => s.interrupt().await,
        }
    }
    pub async fn respond_approval(&self, request_id: &str, allow: bool) {
        match self {
            ChatSession::StreamJson(s) => s.respond_approval(request_id, allow).await,
            ChatSession::Exec(s) => s.respond_approval(request_id, allow).await,
        }
    }
    pub async fn set_model(&self, model: Option<&str>, effort: Option<&str>) {
        match self {
            ChatSession::StreamJson(s) => s.set_model(model, effort).await,
            ChatSession::Exec(s) => s.set_model(model, effort).await,
        }
    }
    pub async fn set_permission_mode(&self, mode: PermissionMode) {
        match self {
            ChatSession::StreamJson(s) => s.set_permission_mode(mode).await,
            ChatSession::Exec(s) => s.set_permission_mode(mode).await,
        }
    }
    pub async fn run_command(&self, command: &str) {
        match self {
            ChatSession::StreamJson(s) => s.run_command(command).await,
            ChatSession::Exec(s) => s.run_command(command).await,
        }
    }

    // ---- reads (sync) ---------------------------------------------------------------------------
    pub fn status(&self) -> Status {
        dispatch!(self, status())
    }
    pub fn subscribe_status(&self) -> watch::Receiver<Status> {
        dispatch!(self, subscribe_status())
    }
    pub fn subscribe_chat(&self) -> broadcast::Receiver<ChatEvent> {
        dispatch!(self, subscribe_chat())
    }
    pub fn subscribe_delta(&self) -> broadcast::Receiver<String> {
        dispatch!(self, subscribe_delta())
    }
    pub fn delta_snapshot(&self) -> String {
        dispatch!(self, delta_snapshot())
    }
    pub fn subscribe_approval(&self) -> broadcast::Receiver<ToolApproval> {
        dispatch!(self, subscribe_approval())
    }
    pub fn subscribe_resolved(&self) -> broadcast::Receiver<String> {
        dispatch!(self, subscribe_resolved())
    }
    pub fn approval_snapshot(&self) -> Vec<ToolApproval> {
        dispatch!(self, approval_snapshot())
    }
    pub fn subagents(&self) -> Vec<SubAgent> {
        dispatch!(self, subagents())
    }
    pub fn subscribe_subagents(&self) -> watch::Receiver<Vec<SubAgent>> {
        dispatch!(self, subscribe_subagents())
    }
    pub fn commands(&self) -> Vec<SlashCommand> {
        dispatch!(self, commands())
    }
    pub fn subscribe_commands(&self) -> watch::Receiver<Vec<SlashCommand>> {
        dispatch!(self, subscribe_commands())
    }
    pub fn context_tokens(&self) -> Option<u32> {
        dispatch!(self, context_tokens())
    }
    pub fn subscribe_context(&self) -> watch::Receiver<Option<u32>> {
        dispatch!(self, subscribe_context())
    }
    pub fn chat_snapshot(&self) -> Vec<ChatEvent> {
        dispatch!(self, chat_snapshot())
    }
    pub fn chat_tail(&self, limit: usize) -> (Vec<ChatEvent>, bool) {
        dispatch!(self, chat_tail(limit))
    }
    pub fn chat_earlier(&self, loaded: usize, count: usize) -> (Vec<ChatEvent>, bool) {
        dispatch!(self, chat_earlier(loaded, count))
    }
    pub fn shutdown(&self) {
        dispatch!(self, shutdown())
    }
}
