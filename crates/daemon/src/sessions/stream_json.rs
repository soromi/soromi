//! The headless "chat" backend: drives an agent (Claude) non-interactively over its `stream-json`
//! interface and produces the *same* `ChatEvent`s the terminal transcript does — so the existing
//! chat view renders it unchanged. No PTY. The agent is a piped child process (`tokio::process`); we
//! read newline-delimited JSON frames off its stdout and write user turns to its stdin. Approvals
//! (the `can_use_tool` control channel) and streaming deltas land in later phases. See
//! `plans/headless-agent-chat.md`.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{broadcast, watch};
use tokio::task::AbortHandle;

use std::path::{Path, PathBuf};

use soromi_protocol::{
    ChatEvent, ChatFile, PermissionMode, SlashCommand, Status, SubAgent, ToolApproval,
};

use crate::providers::Provider;
use crate::sessions::session::track_subagents;

const CHAT_CAPACITY: usize = 512;

/// A tool call the CLI is waiting on: what to show the user, plus the original input we echo back as
/// `updatedInput` when they allow it.
#[derive(Clone)]
struct Pending {
    approval: ToolApproval,
    input: Value,
}

/// One headless agent conversation. Cheap to clone via `Arc` so the transport can share it.
pub struct StreamJsonSession {
    child: Arc<Mutex<Child>>,
    stdin: Arc<tokio::sync::Mutex<ChildStdin>>,
    status_tx: Arc<watch::Sender<Status>>,
    status_rx: watch::Receiver<Status>,
    chat_tx: broadcast::Sender<ChatEvent>,
    chat_log: Arc<Mutex<Vec<ChatEvent>>>,
    // The assistant message currently streaming in, token by token (from `stream_event` deltas). It
    // is not part of `chat_log` — the complete `assistant` frame commits that. `delta_tx` broadcasts
    // the cumulative text as it grows (empty string = the live message cleared / committed).
    delta_tx: broadcast::Sender<String>,
    partial: Arc<Mutex<String>>,
    // Tool approvals: `approval_tx` announces a new `can_use_tool` request, `resolved_tx` announces
    // one was answered (so all viewers clear it), and `pending` holds the unanswered ones (for the
    // response's `updatedInput` and for a viewer attaching mid-approval).
    approval_tx: broadcast::Sender<ToolApproval>,
    resolved_tx: broadcast::Sender<String>,
    pending: Arc<Mutex<HashMap<String, Pending>>>,
    // Set when we send an interrupt; the CLI then reports the stop as a `user` message, which the
    // reader converts to a `Notice` (so the UI knows it was interrupted without matching the text).
    interrupted: Arc<AtomicBool>,
    // Sub-agents (`Task` calls) running this turn, keyed by tool id. Mirrors the PTY session's
    // tracking so a chat tab can show "N agents working in the background" over its composer.
    // Kept to co-own the state/senders alongside the reader task (which drives them via clones); read
    // from `self` only through the `_rx` receivers, so the fields themselves are otherwise unused.
    #[allow(dead_code)]
    active_subagents: Arc<Mutex<Vec<(String, SubAgent)>>>,
    #[allow(dead_code)]
    subagents_tx: Arc<watch::Sender<Vec<SubAgent>>>,
    subagents_rx: watch::Receiver<Vec<SubAgent>>,
    // The provider's slash commands ("actions"), captured once from the `system/init` frame. Empty
    // for providers that don't expose them (the capability signal for the chat `/` menu).
    #[allow(dead_code)]
    commands_tx: Arc<watch::Sender<Vec<SlashCommand>>>,
    commands_rx: watch::Receiver<Vec<SlashCommand>>,
    // Tokens the conversation currently occupies (last turn's prompt + cache), for the context meter.
    #[allow(dead_code)]
    context_tx: Arc<watch::Sender<Option<u32>>>,
    context_rx: watch::Receiver<Option<u32>>,
    // The permission mode we enforce on `can_use_tool` requests: the CLI routes every tool here (our
    // `--permission-prompt-tool`), so bypass / auto-accept are applied on our side (the CLI's live
    // `set_permission_mode` doesn't reliably switch into bypass). Shared with the reader.
    permission_mode: Arc<Mutex<PermissionMode>>,
    reader: Option<AbortHandle>,
}

impl StreamJsonSession {
    /// Spawns the headless agent (its stream-json command comes from the provider) with piped stdio.
    /// `env` replaces the process environment when `Some` (the account's config dir + `SOROMI_*`),
    /// mirroring the PTY launch; `None` inherits the daemon's.
    pub fn spawn(
        provider: &'static dyn Provider,
        program: &str,
        args: &[String],
        cwd: &str,
        env: Option<&[(String, String)]>,
        // The prior conversation, parsed from the on-disk transcript, so a resumed chat backend shows
        // its history immediately. Empty for a fresh conversation. The CLI does not replay the
        // transcript on stdout when resuming, so without this seed a switched-in tab would be blank.
        seed: Vec<ChatEvent>,
        // The tab's permission mode (also its launch `--permission-mode` flag), enforced on approvals.
        permission_mode: PermissionMode,
    ) -> anyhow::Result<Self> {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            // Keep the agent's own diagnostics on our stderr; only stdout is the protocol.
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        if let Some(env) = env {
            cmd.env_clear();
            for (key, value) in env {
                cmd.env(key, value);
            }
        }

        let mut child = cmd.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("child has no stdout"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow::anyhow!("child has no stdin"))?;

        let (status_tx, status_rx) = watch::channel(Status::Idle);
        let status_tx = Arc::new(status_tx);
        let (chat_tx, _) = broadcast::channel(CHAT_CAPACITY);
        let chat_log = Arc::new(Mutex::new(seed));
        let (delta_tx, _) = broadcast::channel(CHAT_CAPACITY);
        let partial = Arc::new(Mutex::new(String::new()));
        let (approval_tx, _) = broadcast::channel(CHAT_CAPACITY);
        let (resolved_tx, _) = broadcast::channel(CHAT_CAPACITY);
        let pending: Arc<Mutex<HashMap<String, Pending>>> = Arc::new(Mutex::new(HashMap::new()));
        let interrupted = Arc::new(AtomicBool::new(false));
        let active_subagents = Arc::new(Mutex::new(Vec::new()));
        let (subagents_tx, subagents_rx) = watch::channel(Vec::new());
        let subagents_tx = Arc::new(subagents_tx);
        // Seed the `/` menu with the provider's built-in commands so it works before the first turn —
        // Claude only reports its full list in `system/init`, which it emits only after a turn is sent.
        // The real list (with plugin/MCP commands) replaces this once it arrives.
        let (commands_tx, commands_rx) = watch::channel(provider.default_commands(Path::new(cwd)));
        let commands_tx = Arc::new(commands_tx);
        let (context_tx, context_rx) = watch::channel(None);
        let context_tx = Arc::new(context_tx);
        let permission_mode = Arc::new(Mutex::new(permission_mode));
        let stdin = Arc::new(tokio::sync::Mutex::new(stdin));

        // Handshake: the control channel (approvals) only wakes up after an `initialize` request.
        {
            let stdin = stdin.clone();
            tokio::spawn(async move {
                let init = json!({
                    "type": "control_request",
                    "request_id": "init-1",
                    "request": { "subtype": "initialize", "hooks": {} },
                })
                .to_string();
                let mut guard = stdin.lock().await;
                let _ = guard.write_all(init.as_bytes()).await;
                let _ = guard.write_all(b"\n").await;
                let _ = guard.flush().await;
            });
        }

        let reader = spawn_reader(
            stdout,
            provider,
            chat_tx.clone(),
            chat_log.clone(),
            status_tx.clone(),
            delta_tx.clone(),
            partial.clone(),
            approval_tx.clone(),
            pending.clone(),
            interrupted.clone(),
            active_subagents.clone(),
            subagents_tx.clone(),
            commands_tx.clone(),
            context_tx.clone(),
            permission_mode.clone(),
            stdin.clone(),
            PathBuf::from(cwd),
        );

        Ok(Self {
            child: Arc::new(Mutex::new(child)),
            stdin,
            status_tx,
            status_rx,
            chat_tx,
            chat_log,
            delta_tx,
            partial,
            approval_tx,
            resolved_tx,
            pending,
            interrupted,
            active_subagents,
            subagents_tx,
            subagents_rx,
            commands_tx,
            commands_rx,
            context_tx,
            context_rx,
            permission_mode,
            reader: Some(reader),
        })
    }

    /// Sends a user turn: writes the stream-json user envelope to stdin, marks the tab running, and
    /// records the message locally (the CLI does not echo the user's prompt back on stdout, so the
    /// chat view would otherwise never show it). `files` are pasted/attached images and documents.
    ///
    /// Sending while the agent is already working *steers* the turn: the CLI queues the message on
    /// its stdin and folds it into the running turn rather than starting a new one. We keep any
    /// in-flight streaming partial in that case (only a fresh turn drops it).
    pub async fn send_turn(&self, text: &str, files: &[ChatFile]) {
        let steering = !matches!(self.status(), Status::Idle);
        // With no attachments a plain string content is simplest; otherwise a content-block array
        // (text + image/document blocks) so the agent receives what was pasted.
        let content = if files.is_empty() {
            Value::String(text.to_string())
        } else {
            let mut blocks = vec![json!({ "type": "text", "text": text })];
            for file in files {
                blocks.push(file_block(file));
            }
            Value::Array(blocks)
        };
        let envelope = json!({ "type": "user", "message": { "role": "user", "content": content } })
            .to_string();
        {
            let mut stdin = self.stdin.lock().await;
            let _ = stdin.write_all(envelope.as_bytes()).await;
            let _ = stdin.write_all(b"\n").await;
            let _ = stdin.flush().await;
        }
        let _ = self.status_tx.send(Status::Thinking);
        // A fresh turn drops any leftover streaming partial; steering leaves the live reply intact.
        if !steering {
            if let Ok(mut partial) = self.partial.lock() {
                partial.clear();
            }
            let _ = self.delta_tx.send(String::new());
        }
        // Record the prompt with its attachments so the bubble can show inline thumbnails (the wire
        // content already carries the binary; the CLI doesn't echo the prompt back).
        let event = ChatEvent::User {
            text: text.to_string(),
            files: files.to_vec(),
        };
        if let Ok(mut log) = self.chat_log.lock() {
            log.push(event.clone());
        }
        let _ = self.chat_tx.send(event);
    }

    /// Interrupts the current turn (the composer's stop button): sends the stream-json `interrupt`
    /// control request. The CLI stops and emits a `result` frame, which the reader maps to idle.
    pub async fn interrupt(&self) {
        self.interrupted.store(true, Ordering::Relaxed);
        static SEQ: AtomicU64 = AtomicU64::new(1);
        let request_id = format!("interrupt-{}", SEQ.fetch_add(1, Ordering::Relaxed));
        let request = json!({
            "type": "control_request",
            "request_id": request_id,
            "request": { "subtype": "interrupt" },
        })
        .to_string();
        let mut stdin = self.stdin.lock().await;
        let _ = stdin.write_all(request.as_bytes()).await;
        let _ = stdin.write_all(b"\n").await;
        let _ = stdin.flush().await;
    }

    /// Answers a pending tool approval: writes the `control_response` the CLI is blocked on. `allow`
    /// echoes the original input as `updatedInput`; a deny sends a short message. The turn resumes.
    pub async fn respond_approval(&self, request_id: &str, allow: bool) {
        let Some(entry) = self.pending.lock().unwrap().remove(request_id) else {
            return;
        };
        let decision = if allow {
            json!({ "behavior": "allow", "updatedInput": entry.input })
        } else {
            json!({ "behavior": "deny", "message": "The user denied this tool." })
        };
        let response = json!({
            "type": "control_response",
            "response": { "subtype": "success", "request_id": request_id, "response": decision },
        })
        .to_string();
        {
            let mut stdin = self.stdin.lock().await;
            let _ = stdin.write_all(response.as_bytes()).await;
            let _ = stdin.write_all(b"\n").await;
            let _ = stdin.flush().await;
        }
        let _ = self.resolved_tx.send(request_id.to_string());
        // The agent runs again (allowed) or reacts to the denial; either way it's working, not idle.
        let _ = self.status_tx.send(Status::Thinking);
    }

    /// Changes the model + reasoning effort live (the composer's model dropdown) by sending the
    /// argument-form slash commands the CLI accepts as messages (`/model <alias>`, `/effort <level>`).
    /// Sent as commands, not recorded in the chat log — they change session state, not the transcript.
    /// `model` `None` resets to the provider default.
    pub async fn set_model(&self, model: Option<&str>, effort: Option<&str>) {
        self.send_command(&format!("/model {}", model.unwrap_or("default")))
            .await;
        if let Some(effort) = effort {
            self.send_command(&format!("/effort {effort}")).await;
        }
    }

    /// Writes a bare slash command to the CLI as a user message (how headless mode invokes commands),
    /// without touching the chat log or status — for state-changing commands like `/model`.
    async fn send_command(&self, text: &str) {
        let envelope =
            json!({ "type": "user", "message": { "role": "user", "content": text } }).to_string();
        let mut stdin = self.stdin.lock().await;
        let _ = stdin.write_all(envelope.as_bytes()).await;
        let _ = stdin.write_all(b"\n").await;
        let _ = stdin.flush().await;
    }

    /// Changes the permission mode live (the composer dropdown). Records it so the reader enforces
    /// bypass / auto-accept on our side, and tells the CLI via a `set_permission_mode` control request
    /// (which drives plan mode and lets the CLI optimize when it honors the switch).
    pub async fn set_permission_mode(&self, mode: PermissionMode) {
        if let Ok(mut current) = self.permission_mode.lock() {
            *current = mode;
        }
        static SEQ: AtomicU64 = AtomicU64::new(1);
        let request = json!({
            "type": "control_request",
            "request_id": format!("mode-{}", SEQ.fetch_add(1, Ordering::Relaxed)),
            "request": { "subtype": "set_permission_mode", "mode": mode.as_flag() },
        })
        .to_string();
        let mut stdin = self.stdin.lock().await;
        let _ = stdin.write_all(request.as_bytes()).await;
        let _ = stdin.write_all(b"\n").await;
        let _ = stdin.flush().await;
    }

    pub fn subscribe_approval(&self) -> broadcast::Receiver<ToolApproval> {
        self.approval_tx.subscribe()
    }

    pub fn subscribe_resolved(&self) -> broadcast::Receiver<String> {
        self.resolved_tx.subscribe()
    }

    /// The tool approvals awaiting an answer right now, so a viewer attaching mid-turn sees them.
    pub fn approval_snapshot(&self) -> Vec<ToolApproval> {
        self.pending
            .lock()
            .map(|pending| pending.values().map(|p| p.approval.clone()).collect())
            .unwrap_or_default()
    }

    pub fn status(&self) -> Status {
        *self.status_rx.borrow()
    }

    pub fn subscribe_status(&self) -> watch::Receiver<Status> {
        self.status_rx.clone()
    }

    /// The sub-agents (`Task` calls) running this turn, for the chat tab's "agents working" panel.
    pub fn subagents(&self) -> Vec<SubAgent> {
        self.subagents_rx.borrow().clone()
    }

    pub fn subscribe_subagents(&self) -> watch::Receiver<Vec<SubAgent>> {
        self.subagents_rx.clone()
    }

    /// The provider's slash commands ("actions") for this session, for the chat `/` menu. Empty until
    /// the `system/init` frame arrives, and for providers that don't expose them.
    pub fn commands(&self) -> Vec<SlashCommand> {
        self.commands_rx.borrow().clone()
    }

    pub fn subscribe_commands(&self) -> watch::Receiver<Vec<SlashCommand>> {
        self.commands_rx.clone()
    }

    /// Tokens the conversation currently occupies (last turn's prompt + cache), for the context meter.
    pub fn context_tokens(&self) -> Option<u32> {
        *self.context_rx.borrow()
    }

    pub fn subscribe_context(&self) -> watch::Receiver<Option<u32>> {
        self.context_rx.clone()
    }

    /// Runs a bare slash command (e.g. `/compact`, `/clear`) as a command message — not recorded in
    /// the chat log. The context controls (compact / clear) use this. Marks the tab working so the
    /// composer shows progress (compaction can take a while); the command's `result` frame returns it
    /// to idle, and a `compact_boundary` surfaces as a notice.
    pub async fn run_command(&self, command: &str) {
        self.send_command(command).await;
        let _ = self.status_tx.send(Status::Thinking);
    }

    pub fn subscribe_chat(&self) -> broadcast::Receiver<ChatEvent> {
        self.chat_tx.subscribe()
    }

    pub fn chat_snapshot(&self) -> Vec<ChatEvent> {
        self.chat_log
            .lock()
            .map(|log| log.clone())
            .unwrap_or_default()
    }

    /// The most recent `limit` events, plus whether older ones remain. The viewport loads only this
    /// tail on attach (a long transcript is thousands of markdown trees), and pages back on demand.
    pub fn chat_tail(&self, limit: usize) -> (Vec<ChatEvent>, bool) {
        let Ok(log) = self.chat_log.lock() else {
            return (Vec::new(), false);
        };
        let start = log.len().saturating_sub(limit);
        (log[start..].to_vec(), start > 0)
    }

    /// The `count` events just before the `loaded` most recent the viewport already holds (a contiguous
    /// suffix), plus whether older ones remain. Serves the "Load earlier" page.
    pub fn chat_earlier(&self, loaded: usize, count: usize) -> (Vec<ChatEvent>, bool) {
        let Ok(log) = self.chat_log.lock() else {
            return (Vec::new(), false);
        };
        let oldest = log.len().saturating_sub(loaded);
        let start = oldest.saturating_sub(count);
        (log[start..oldest].to_vec(), start > 0)
    }

    pub fn subscribe_delta(&self) -> broadcast::Receiver<String> {
        self.delta_tx.subscribe()
    }

    /// The assistant text streaming in right now (empty when nothing is mid-stream), so a viewer that
    /// attaches partway through a turn sees the in-progress reply.
    pub fn delta_snapshot(&self) -> String {
        self.partial.lock().map(|p| p.clone()).unwrap_or_default()
    }

    /// Kills the child and stops the reader.
    pub fn shutdown(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.start_kill();
        }
        if let Some(reader) = &self.reader {
            reader.abort();
        }
    }
}

impl Drop for StreamJsonSession {
    fn drop(&mut self) {
        if let Some(reader) = self.reader.take() {
            reader.abort();
        }
        self.shutdown();
    }
}

/// Follows the child's stdout, classifying each JSON frame and publishing the results.
#[allow(clippy::too_many_arguments)]
fn spawn_reader<R: AsyncRead + Unpin + Send + 'static>(
    stdout: R,
    provider: &'static dyn Provider,
    chat_tx: broadcast::Sender<ChatEvent>,
    chat_log: Arc<Mutex<Vec<ChatEvent>>>,
    status_tx: Arc<watch::Sender<Status>>,
    delta_tx: broadcast::Sender<String>,
    partial: Arc<Mutex<String>>,
    approval_tx: broadcast::Sender<ToolApproval>,
    pending: Arc<Mutex<HashMap<String, Pending>>>,
    interrupted: Arc<AtomicBool>,
    active_subagents: Arc<Mutex<Vec<(String, SubAgent)>>>,
    subagents_tx: Arc<watch::Sender<Vec<SubAgent>>>,
    commands_tx: Arc<watch::Sender<Vec<SlashCommand>>>,
    context_tx: Arc<watch::Sender<Option<u32>>>,
    permission_mode: Arc<Mutex<PermissionMode>>,
    stdin: Arc<tokio::sync::Mutex<ChildStdin>>,
    cwd: PathBuf,
) -> AbortHandle {
    // Clears the streaming partial and tells viewers the live message is gone (committed / ended).
    let clear_partial = {
        let partial = partial.clone();
        let delta_tx = delta_tx.clone();
        move || {
            if let Ok(mut buffer) = partial.lock() {
                if buffer.is_empty() {
                    return;
                }
                buffer.clear();
            }
            let _ = delta_tx.send(String::new());
        }
    };

    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            // The context meter: a turn's prompt + cached tokens are the current context size; a
            // compaction frees it (reset to unknown until the next turn reports the new, smaller size).
            if let Some(update) = context_update_from(&line) {
                let _ = context_tx.send(update);
            }
            match classify(&line, provider) {
                Dispatch::Chat(events) => {
                    // The complete frame commits the message; drop the streaming stand-in.
                    clear_partial();
                    // Right after an interrupt, the CLI reports the stop as a `user` message — surface
                    // it as a system `Notice` instead (so the UI need not match the wording). The flag
                    // stays set through any tool_results until that user message is seen.
                    let events: Vec<ChatEvent> = events
                        .into_iter()
                        .map(|event| match event {
                            ChatEvent::User { text, .. }
                                if interrupted.swap(false, Ordering::Relaxed) =>
                            {
                                ChatEvent::Notice { text }
                            }
                            other => other,
                        })
                        .collect();
                    if let Ok(mut log) = chat_log.lock() {
                        log.extend(events.iter().cloned());
                    }
                    // Update the running sub-agent set (a `Task` starts one, its result ends it) so the
                    // chat tab can show them over the composer. Only republish on a real change.
                    if let Ok(mut active) = active_subagents.lock()
                        && track_subagents(&mut active, &events)
                    {
                        let list = active.iter().map(|(_, agent)| agent.clone()).collect();
                        let _ = subagents_tx.send(list);
                    }
                    for event in events {
                        let _ = chat_tx.send(event);
                    }
                }
                Dispatch::Delta(text) => {
                    if let Ok(mut buffer) = partial.lock() {
                        buffer.push_str(&text);
                        let _ = delta_tx.send(buffer.clone());
                    }
                }
                Dispatch::Status(status) => {
                    if matches!(status, Status::Idle) {
                        clear_partial();
                        // Turn ended; don't let a never-delivered interrupt marker leak to the next.
                        interrupted.store(false, Ordering::Relaxed);
                    }
                    let _ = status_tx.send(status);
                }
                Dispatch::Approval(approval, input) => {
                    // Enforce the permission mode on our side (the CLI routes every tool here): bypass
                    // allows everything, auto-accept allows edits. Otherwise surface it to the user.
                    let mode = permission_mode.lock().map(|m| *m).unwrap_or_default();
                    let auto_allow = match mode {
                        PermissionMode::BypassPermissions => true,
                        PermissionMode::AcceptEdits => is_edit_tool(&approval.name),
                        _ => false,
                    };
                    if auto_allow {
                        let response = json!({
                            "type": "control_response",
                            "response": {
                                "subtype": "success",
                                "request_id": approval.id,
                                "response": { "behavior": "allow", "updatedInput": input },
                            },
                        })
                        .to_string();
                        let mut guard = stdin.lock().await;
                        let _ = guard.write_all(response.as_bytes()).await;
                        let _ = guard.write_all(b"\n").await;
                        let _ = guard.flush().await;
                    } else {
                        // Park it (for the response + snapshot), announce it, and mark the tab waiting.
                        if let Ok(mut map) = pending.lock() {
                            map.insert(
                                approval.id.clone(),
                                Pending {
                                    approval: approval.clone(),
                                    input,
                                },
                            );
                        }
                        let _ = approval_tx.send(approval);
                        let _ = status_tx.send(Status::WaitingInput);
                    }
                }
                Dispatch::Commands(names) => {
                    // Annotate each command with the provider's description (built-in map + custom
                    // frontmatter), then publish once — the set is fixed for the session.
                    let list: Vec<SlashCommand> = names
                        .into_iter()
                        .map(|name| SlashCommand {
                            description: provider.describe_command(&name, &cwd),
                            name,
                        })
                        .collect();
                    let _ = commands_tx.send(list);
                }
                Dispatch::None => {}
            }
        }
        // Stdout closed: the turn/process ended. Fall back to idle.
        clear_partial();
        let _ = status_tx.send(Status::Idle);
    })
    .abort_handle()
}

/// One attached file as a Claude content block: images and PDFs carry their base64 directly; a text
/// file is decoded and inlined (labelled with its name); anything else falls back to a note.
fn file_block(file: &ChatFile) -> Value {
    if file.media_type.starts_with("image/") {
        return json!({
            "type": "image",
            "source": { "type": "base64", "media_type": file.media_type, "data": file.data },
        });
    }
    if file.media_type == "application/pdf" {
        return json!({
            "type": "document",
            "source": { "type": "base64", "media_type": "application/pdf", "data": file.data },
        });
    }
    // Text (or unknown): try to decode the base64 and inline it as text.
    let name = file.filename.clone().unwrap_or_else(|| "file".to_string());
    let text = base64_text(&file.data)
        .map(|body| format!("[File: {name}]\n{body}"))
        .unwrap_or_else(|| format!("[Attached {name} ({})]", file.media_type));
    json!({ "type": "text", "text": text })
}

/// Decodes standard base64 (the data-URL payload) to UTF-8 text, or `None` if it isn't valid text.
fn base64_text(data: &str) -> Option<String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .ok()?;
    String::from_utf8(bytes).ok()
}

/// What one stdout frame means to us.
enum Dispatch {
    /// Conversation content (assistant text/tool-use, or a tool result) — parsed to chat events.
    Chat(Vec<ChatEvent>),
    /// A streaming token: more text for the assistant message currently being written.
    Delta(String),
    /// A turn lifecycle change — the derived status.
    Status(Status),
    /// A `can_use_tool` request: the tool to show, plus its original input (echoed back on allow).
    Approval(ToolApproval, Value),
    /// The provider's available slash commands (names, no `/`), from the `system/init` frame.
    Commands(Vec<String>),
    /// Nothing we surface (`system`, other control frames, non-text stream events).
    None,
}

/// A context-meter update from a frame: `Some(Some(n))` = the current context size (an `assistant`
/// frame's prompt + cached tokens); `Some(None)` = a `compact_boundary` freed the context (reset until
/// the next turn reports the new, smaller size); `None` = the frame carries nothing for the meter.
fn context_update_from(line: &str) -> Option<Option<u32>> {
    let value: Value = serde_json::from_str(line).ok()?;
    match value.get("type").and_then(Value::as_str) {
        Some("assistant") => {
            let usage = value.pointer("/message/usage")?;
            let field = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
            let total = field("input_tokens")
                + field("cache_read_input_tokens")
                + field("cache_creation_input_tokens");
            (total > 0).then_some(Some(total as u32))
        }
        Some("system")
            if value.get("subtype").and_then(Value::as_str) == Some("compact_boundary") =>
        {
            Some(None)
        }
        _ => None,
    }
}

/// Maps a stream-json frame to a `Dispatch`. The `assistant`/`user` frames are byte-for-byte the same
/// shape as transcript lines, so the provider's transcript parser handles them directly; `result`
/// ends the turn. Everything else is ignored for now (forward-compatible: unknown `type`s are safe).
fn classify(line: &str, provider: &'static dyn Provider) -> Dispatch {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return Dispatch::None;
    };
    match value.get("type").and_then(Value::as_str) {
        Some("assistant") | Some("user") => {
            let events = provider.parse_transcript_line(line);
            if events.is_empty() {
                Dispatch::None
            } else {
                Dispatch::Chat(events)
            }
        }
        // The session's opening frame lists the provider's available slash commands ("actions"). Only
        // Claude emits it, so it doubles as the capability signal for the chat `/` menu.
        Some("system") if value.get("subtype").and_then(Value::as_str) == Some("init") => {
            match value.get("slash_commands").and_then(Value::as_array) {
                Some(list) => Dispatch::Commands(
                    list.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect(),
                ),
                None => Dispatch::None,
            }
        }
        // Compaction ran (context freed up), auto when the window filled or from `/compact`. Surface
        // it as a system notice so the conversation shows what happened.
        Some("system")
            if value.get("subtype").and_then(Value::as_str) == Some("compact_boundary") =>
        {
            let auto = value
                .pointer("/compact_metadata/trigger")
                .and_then(Value::as_str)
                == Some("auto");
            let text = if auto {
                "Context was full — automatically compacted to free space".to_string()
            } else {
                "Conversation compacted to free up context".to_string()
            };
            Dispatch::Chat(vec![ChatEvent::Notice { text }])
        }
        // A turn finished; the agent is idle waiting for the next message.
        Some("result") => Dispatch::Status(Status::Idle),
        // Streaming token deltas (`--include-partial-messages`). Surface assistant `text_delta` as
        // live partial text; the complete `assistant` frame commits it. Other events (message
        // start/stop, thinking) are ignored — print mode rarely emits reasoning text.
        Some("stream_event") => {
            let delta = value.pointer("/event/delta");
            match delta.and_then(|d| d.get("type")).and_then(Value::as_str) {
                Some("text_delta") => delta
                    .and_then(|d| d.get("text"))
                    .and_then(Value::as_str)
                    .filter(|text| !text.is_empty())
                    .map(|text| Dispatch::Delta(text.to_string()))
                    .unwrap_or(Dispatch::None),
                _ => Dispatch::None,
            }
        }
        // A tool needs approval (`--permission-prompt-tool stdio`). Other control requests (the CLI's
        // reply to our `initialize`, etc.) are ignored.
        Some("control_request")
            if value.pointer("/request/subtype").and_then(Value::as_str)
                == Some("can_use_tool") =>
        {
            let request_id = value
                .get("request_id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let tool_name = value
                .pointer("/request/tool_name")
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let input = value
                .pointer("/request/input")
                .cloned()
                .unwrap_or(Value::Null);
            Dispatch::Approval(
                build_approval(provider, request_id, tool_name, &input),
                input,
            )
        }
        _ => Dispatch::None,
    }
}

/// Whether a tool is a file edit (auto-allowed in `acceptEdits` mode). Covers Claude's edit tools.
fn is_edit_tool(name: &str) -> bool {
    matches!(
        name,
        "Edit" | "Write" | "MultiEdit" | "NotebookEdit" | "Update"
    )
}

/// Renders a `can_use_tool` request as a `ToolApproval` by reusing the provider's transcript parser:
/// a `tool_use` block has the same shape here, so we get the same name / path / body a tool card shows.
fn build_approval(
    provider: &dyn Provider,
    request_id: &str,
    tool_name: &str,
    input: &Value,
) -> ToolApproval {
    let synthetic = json!({
        "type": "assistant",
        "message": { "role": "assistant", "content": [
            { "type": "tool_use", "id": request_id, "name": tool_name, "input": input },
        ]},
    })
    .to_string();
    let (path, body) = provider
        .parse_transcript_line(&synthetic)
        .into_iter()
        .find_map(|event| match event {
            ChatEvent::Tool { path, body, .. } => Some((path, body)),
            _ => None,
        })
        .unwrap_or((None, None));
    ToolApproval {
        id: request_id.to_string(),
        name: tool_name.to_string(),
        path,
        body,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claude() -> &'static dyn Provider {
        crate::providers::provider("claude").expect("claude provider")
    }

    fn events(dispatch: Dispatch) -> Vec<ChatEvent> {
        match dispatch {
            Dispatch::Chat(events) => events,
            _ => Vec::new(),
        }
    }

    #[test]
    fn classifies_an_assistant_text_frame_as_a_chat_event() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}"#;
        assert_eq!(
            events(classify(line, claude())),
            vec![ChatEvent::Assistant {
                text: "hello".into()
            }]
        );
    }

    #[test]
    fn classifies_an_assistant_tool_use_frame() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]}}"#;
        assert_eq!(
            events(classify(line, claude())),
            vec![ChatEvent::Tool {
                id: "t1".into(),
                name: "Bash".into(),
                path: None,
                body: Some("ls".into()),
            }]
        );
    }

    #[test]
    fn classifies_a_user_tool_result_frame() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"out","is_error":false}]}}"#;
        assert_eq!(
            events(classify(line, claude())),
            vec![ChatEvent::ToolResult {
                id: "t1".into(),
                ok: true,
                text: "out".into(),
            }]
        );
    }

    #[test]
    fn a_result_frame_ends_the_turn_as_idle() {
        let line = r#"{"type":"result","subtype":"success","session_id":"s","result":"done"}"#;
        assert!(matches!(
            classify(line, claude()),
            Dispatch::Status(Status::Idle)
        ));
    }

    #[test]
    fn system_stream_event_and_junk_frames_are_ignored() {
        assert!(matches!(
            classify(
                r#"{"type":"system","subtype":"init","session_id":"s"}"#,
                claude()
            ),
            Dispatch::None
        ));
        assert!(matches!(
            classify(
                r#"{"type":"stream_event","event":{"type":"content_block_delta"}}"#,
                claude()
            ),
            Dispatch::None
        ));
        assert!(matches!(classify("not json", claude()), Dispatch::None));
    }

    #[test]
    fn a_text_delta_stream_event_streams_as_a_delta() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}}"#;
        assert!(matches!(classify(line, claude()), Dispatch::Delta(text) if text == "Hel"));
        // A thinking delta (or any non-text delta) is not surfaced.
        let thinking = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}}"#;
        assert!(matches!(classify(thinking, claude()), Dispatch::None));
    }
}
