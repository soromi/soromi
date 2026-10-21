//! A generic **one-process-per-turn** chat pump. Some providers (Codex) don't hold a persistent
//! stream-json process like Claude — each turn is a fresh CLI run that emits events and exits. This
//! session is pure plumbing: it asks the provider for the turn's command (`chat_turn_command`), spawns
//! it, and maps each output line through `parse_chat_frame` / `context_tokens` onto the same channels
//! `StreamJsonSession` exposes — so the transport and chat UI drive it identically. No provider
//! specifics live here; they're all behind the `Provider` trait.

use std::process::Stdio;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, watch};

use soromi_protocol::{
    ChatEvent, ChatFile, PermissionMode, SlashCommand, Status, SubAgent, ToolApproval,
};

use crate::providers::{ChatFrame, Provider};
use crate::sessions::chat_log::ChatLog;
use crate::sessions::delta::{DeltaFrame, DeltaStream};

const CHAT_CAPACITY: usize = 512;

/// One per-turn chat conversation. No process runs between turns; `send_turn` spawns one.
pub struct ExecChatSession {
    provider: &'static dyn Provider,
    program: String,
    cwd: String,
    env: Option<Vec<(String, String)>>,
    // The provider's own conversation id, captured from a `SessionId` frame and resumed next turn.
    resume_id: Arc<Mutex<Option<String>>>,
    model: Arc<Mutex<(Option<String>, Option<String>)>>,
    permission_mode: Arc<Mutex<PermissionMode>>,
    // The turn's process, so `interrupt` can kill it.
    child: Arc<tokio::sync::Mutex<Option<Child>>>,

    status_tx: Arc<watch::Sender<Status>>,
    status_rx: watch::Receiver<Status>,
    chat_log: Arc<ChatLog>,
    delta: DeltaStream,
    // Approvals / sub-agents / slash commands aren't surfaced by a per-turn provider yet — empty
    // channels for interface parity with `StreamJsonSession`.
    approval_tx: broadcast::Sender<ToolApproval>,
    resolved_tx: broadcast::Sender<String>,
    subagents_rx: watch::Receiver<Vec<SubAgent>>,
    commands_rx: watch::Receiver<Vec<SlashCommand>>,
    context_tx: Arc<watch::Sender<Option<u32>>>,
    context_rx: watch::Receiver<Option<u32>>,
}

impl ExecChatSession {
    /// Sets up the session (no process yet — one runs per turn). `program`/`cwd`/`env` mirror the
    /// terminal launch; `seed` is the prior transcript; `resume_id` is the provider's conversation id.
    #[allow(clippy::too_many_arguments)]
    pub fn spawn(
        provider: &'static dyn Provider,
        program: &str,
        cwd: &str,
        env: Option<&[(String, String)]>,
        seed: Vec<ChatEvent>,
        resume_id: Option<String>,
        permission_mode: PermissionMode,
        model: Option<String>,
        effort: Option<String>,
    ) -> anyhow::Result<Self> {
        let (status_tx, status_rx) = watch::channel(Status::Idle);
        let (approval_tx, _) = broadcast::channel(CHAT_CAPACITY);
        let (resolved_tx, _) = broadcast::channel(CHAT_CAPACITY);
        let (_subagents_tx, subagents_rx) = watch::channel(Vec::new());
        let (_commands_tx, commands_rx) = watch::channel(Vec::new());
        let (context_tx, context_rx) = watch::channel(None);

        Ok(Self {
            provider,
            program: program.to_string(),
            cwd: cwd.to_string(),
            env: env.map(<[_]>::to_vec),
            resume_id: Arc::new(Mutex::new(resume_id)),
            model: Arc::new(Mutex::new((model, effort))),
            permission_mode: Arc::new(Mutex::new(permission_mode)),
            child: Arc::new(tokio::sync::Mutex::new(None)),
            status_tx: Arc::new(status_tx),
            status_rx,
            chat_log: Arc::new(ChatLog::new(seed)),
            delta: DeltaStream::new(CHAT_CAPACITY),
            approval_tx,
            resolved_tx,
            subagents_rx,
            commands_rx,
            context_tx: Arc::new(context_tx),
            context_rx,
        })
    }

    /// Runs one turn: records the prompt, spawns the provider's per-turn command, and pumps its output
    /// through `parse_chat_frame` until it exits. `files` are ignored for now (no attachment path yet).
    pub async fn send_turn(&self, text: &str, _files: &[ChatFile]) {
        let user = ChatEvent::User {
            text: text.to_string(),
            files: Vec::new(),
        };
        self.chat_log.push(user);
        let _ = self.status_tx.send(Status::Thinking);

        let (model, effort) = self.model.lock().unwrap().clone();
        let resume = self.resume_id.lock().unwrap().clone();
        let mode = self.permission_mode.lock().map(|m| *m).unwrap_or_default();
        let Some(args) = self.provider.chat_turn_command(
            text,
            resume.as_deref(),
            model.as_deref(),
            effort.as_deref(),
            mode,
        ) else {
            let _ = self.status_tx.send(Status::Idle);
            return;
        };

        let mut cmd = Command::new(&self.program);
        cmd.args(&args)
            .current_dir(&self.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        for key in crate::system::DAEMON_ONLY {
            cmd.env_remove(key);
        }
        if let Some(env) = &self.env {
            cmd.env_clear();
            for (key, value) in env {
                cmd.env(key, value);
            }
        }

        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(error) => {
                self.chat_log.push(ChatEvent::Notice {
                    text: format!("Couldn't start {}: {error}", self.program),
                });
                let _ = self.status_tx.send(Status::Idle);
                return;
            }
        };
        let Some(stdout) = child.stdout.take() else {
            let _ = self.status_tx.send(Status::Idle);
            return;
        };
        *self.child.lock().await = Some(child);

        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(update) = self.provider.context_tokens(&line) {
                let _ = self.context_tx.send(update);
            }
            self.apply(self.provider.parse_chat_frame(&line));
        }
        // The process exited: the turn is over (a `turn.completed` already set Idle; this also covers
        // a crash or an interrupt that closed stdout).
        let _ = self.status_tx.send(Status::Idle);
        *self.child.lock().await = None;
    }

    /// Maps one parsed frame onto the channels.
    fn apply(&self, frame: ChatFrame) {
        match frame {
            ChatFrame::Events(events) => {
                // The complete frame commits the message; drop the streaming stand-in.
                self.delta.reset();
                self.chat_log.extend(events);
            }
            ChatFrame::Delta(text) => {
                self.delta.append(&text);
            }
            ChatFrame::Status(status) => {
                if matches!(status, Status::Idle) {
                    self.delta.reset();
                }
                let _ = self.status_tx.send(status);
            }
            ChatFrame::SessionId(id) => {
                *self.resume_id.lock().unwrap() = Some(id);
            }
            // A per-turn provider surfaces no interactive approvals or command lists yet.
            ChatFrame::Approval(..) | ChatFrame::Commands(_) | ChatFrame::Ignore => {}
        }
    }

    /// Kills the running turn (the composer's stop button) and settles to Idle.
    pub async fn interrupt(&self) {
        if let Some(child) = self.child.lock().await.as_mut() {
            let _ = child.start_kill();
        }
        let _ = self.status_tx.send(Status::Idle);
    }

    /// No interactive approvals in a per-turn provider (permission is a launch flag) — nothing to do.
    pub async fn respond_approval(&self, _request_id: &str, _allow: bool) {}

    /// Records the model + effort for the next turn's command.
    pub async fn set_model(&self, model: Option<&str>, effort: Option<&str>) {
        *self.model.lock().unwrap() = (model.map(str::to_string), effort.map(str::to_string));
    }

    /// Records the permission mode for the next turn.
    pub async fn set_permission_mode(&self, mode: PermissionMode) {
        *self.permission_mode.lock().unwrap() = mode;
    }

    /// A per-turn provider has no in-conversation slash commands — no-op.
    pub async fn run_command(&self, _command: &str) {}

    // ---- read side (mirrors StreamJsonSession) --------------------------------------------------

    pub fn status(&self) -> Status {
        *self.status_rx.borrow()
    }
    pub fn subscribe_status(&self) -> watch::Receiver<Status> {
        self.status_rx.clone()
    }
    /// The transcript, for viewers to follow.
    pub fn chat_log(&self) -> &Arc<ChatLog> {
        &self.chat_log
    }
    pub fn delta_attach(&self) -> (String, broadcast::Receiver<DeltaFrame>) {
        self.delta.attach()
    }
    pub fn subscribe_approval(&self) -> broadcast::Receiver<ToolApproval> {
        self.approval_tx.subscribe()
    }
    pub fn subscribe_resolved(&self) -> broadcast::Receiver<String> {
        self.resolved_tx.subscribe()
    }
    pub fn approval_snapshot(&self) -> Vec<ToolApproval> {
        Vec::new()
    }
    pub fn subagents(&self) -> Vec<SubAgent> {
        Vec::new()
    }
    pub fn subscribe_subagents(&self) -> watch::Receiver<Vec<SubAgent>> {
        self.subagents_rx.clone()
    }
    pub fn commands(&self) -> Vec<SlashCommand> {
        Vec::new()
    }
    pub fn subscribe_commands(&self) -> watch::Receiver<Vec<SlashCommand>> {
        self.commands_rx.clone()
    }
    pub fn context_tokens(&self) -> Option<u32> {
        *self.context_rx.borrow()
    }
    pub fn subscribe_context(&self) -> watch::Receiver<Option<u32>> {
        self.context_rx.clone()
    }

    /// Kills any in-flight turn (best-effort; the process is also `kill_on_drop`).
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.try_lock()
            && let Some(child) = guard.as_mut()
        {
            let _ = child.start_kill();
        }
    }
}

impl Drop for ExecChatSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}
