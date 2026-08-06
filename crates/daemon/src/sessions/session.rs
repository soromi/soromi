use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use tokio::sync::{broadcast, watch};
use tokio::task::AbortHandle;

use soromi_protocol::{ChatEvent, Status, SubAgent};

use super::decoder::Utf8Decoder;
use super::scrollback::ScrollbackBuffer;
use crate::providers::{self, Provider};
use crate::status::state::StatusState;
use crate::transcript::tailer;

const SCROLLBACK_BYTES: usize = 256 * 1024;
const OUTPUT_CAPACITY: usize = 2048;
const CHAT_CAPACITY: usize = 512;

/// How long a `Thinking` session may go without any PTY output before the idle-decay safety net
/// falls it back to `Idle`. Agents (Claude) repaint an animated status line roughly once a second
/// while working, so sustained silence means the turn is over — the reliable end signal is the
/// `Stop` hook (which settles to `Done` first), and this only catches a hook that never fired.
const IDLE_AFTER: Duration = Duration::from_secs(6);
/// How often the decay task checks for the above.
const IDLE_CHECK_EVERY: Duration = Duration::from_secs(2);

/// How to launch a session's PTY. `env` of `None` inherits the daemon's environment.
pub struct SessionOptions {
    /// The provider key (`claude`, `codex`, ...), used to pick this session's status and transcript
    /// parsers. An unknown key means no parsing (raw terminal only).
    pub agent: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: Option<Vec<(String, String)>>,
    pub cols: u16,
    pub rows: u16,
}

/// Owns one PTY. A reader thread pumps output into capped scrollback and a broadcast channel,
/// and derives the agent status from that output (exposed as a watch channel). Cheap to clone
/// via `Arc` so the transport can share it across connections.
pub struct Session {
    /// This session's provider (resolved from the launch command), which owns the status- and
    /// transcript-parsing heuristics. `None` for an unrecognized command: raw terminal, no parsing.
    provider: Option<&'static dyn Provider>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    scrollback: Arc<Mutex<ScrollbackBuffer>>,
    output_tx: broadcast::Sender<String>,
    status_tx: Arc<watch::Sender<Status>>,
    status_rx: watch::Receiver<Status>,
    /// Set when a hook reported an authoritative status (done / waiting-input). While set, the PTY
    /// parser can't move the status (its trailing output would otherwise fight the hook). Cleared
    /// on the user's next input, which starts a new turn.
    settled: Arc<AtomicBool>,
    /// Set once the user has started a turn (first input). Until then the PTY parser stays quiet, so
    /// a fresh or resumed session's startup / replayed output can't produce a phantom status (a
    /// resumed transcript that says "done" must not read as Finished).
    activated: Arc<AtomicBool>,
    /// The last time PTY output arrived, driving the idle-decay safety net. A `Thinking` session
    /// with no output for `IDLE_AFTER` and no settling hook falls back to Idle, so a missed Stop
    /// hook can't leave it stuck on "running".
    last_activity: Arc<Mutex<Instant>>,
    reader_handle: Option<JoinHandle<()>>,
    /// The idle-decay task, aborted on Drop.
    decay_handle: Option<AbortHandle>,
    /// Structured chat events parsed from the agent's transcript: a live feed plus an accumulated
    /// log replayed to a viewport on attach. Empty until a transcript is attached (Claude only).
    chat_tx: broadcast::Sender<ChatEvent>,
    chat_log: Arc<Mutex<Vec<ChatEvent>>>,
    /// Sub-agents the agent has spawned this turn, as `(tool_use_id, sub-agent)`, derived from
    /// `Task` tool-uses in the transcript: a use adds a running one, its result marks it done (or
    /// blocked on error), and a new user prompt clears the lot. Surfaced per-tab in the sidebar; the
    /// watch channel mirrors the list so a change can trigger a workspace re-broadcast.
    active_subagents: Arc<Mutex<Vec<(String, SubAgent)>>>,
    subagents_tx: Arc<watch::Sender<Vec<SubAgent>>>,
    subagents_rx: watch::Receiver<Vec<SubAgent>>,
    /// The agent's current activity — the latest in-progress non-`Task` tool call, as `(tool_use_id,
    /// label)`, derived from the transcript ("Editing config.ts", "Running pnpm test", …). The last
    /// entry is what the agent is doing now; a tool result pops it, a new user prompt clears it.
    pending_tools: Arc<Mutex<Vec<(String, String)>>>,
    activity_tx: Arc<watch::Sender<Option<String>>>,
    activity_rx: watch::Receiver<Option<String>>,
    /// The transcript being tailed and the task doing it, so re-pointing (resume / new conversation)
    /// can dedupe and replace it, and Drop can stop it.
    transcript_path: Arc<Mutex<Option<PathBuf>>>,
    tailer: Arc<Mutex<Option<AbortHandle>>>,
}

impl Session {
    pub fn spawn(opts: SessionOptions) -> anyhow::Result<Self> {
        let provider = providers::provider(&opts.agent);
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: opts.rows,
            cols: opts.cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(&opts.command);
        for arg in &opts.args {
            cmd.arg(arg);
        }
        cmd.cwd(&opts.cwd);
        match &opts.env {
            Some(env) => {
                for (key, value) in env {
                    cmd.env(key, value);
                }
            }
            None => {
                for (key, value) in std::env::vars() {
                    cmd.env(key, value);
                }
            }
        }
        // Declare terminal capabilities (the viewport is xterm.js). A GUI-launched daemon has no
        // TERM in its env, which would leave agent TUIs guessing and garble redraws.
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pair.slave.spawn_command(cmd)?;
        // Drop the slave so the master reads EOF once the child exits.
        drop(pair.slave);

        let reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        let scrollback = Arc::new(Mutex::new(ScrollbackBuffer::new(SCROLLBACK_BYTES)));
        let (output_tx, _) = broadcast::channel(OUTPUT_CAPACITY);
        let (status_tx, status_rx) = watch::channel(Status::Idle);
        let status_tx = Arc::new(status_tx);
        let settled = Arc::new(AtomicBool::new(false));
        let activated = Arc::new(AtomicBool::new(false));
        let last_activity = Arc::new(Mutex::new(Instant::now()));

        let reader_handle = spawn_reader(
            reader,
            provider,
            scrollback.clone(),
            output_tx.clone(),
            status_tx.clone(),
            settled.clone(),
            activated.clone(),
            last_activity.clone(),
        );
        let decay_handle = spawn_idle_decay(
            status_tx.clone(),
            status_rx.clone(),
            settled.clone(),
            last_activity.clone(),
        );

        let (chat_tx, _) = broadcast::channel(CHAT_CAPACITY);
        let (subagents_tx, subagents_rx) = watch::channel(Vec::new());
        let (activity_tx, activity_rx) = watch::channel(None);

        Ok(Session {
            provider,
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            child: Arc::new(Mutex::new(child)),
            scrollback,
            output_tx,
            status_tx,
            status_rx,
            settled,
            activated,
            last_activity,
            reader_handle: Some(reader_handle),
            decay_handle,
            chat_tx,
            chat_log: Arc::new(Mutex::new(Vec::new())),
            active_subagents: Arc::new(Mutex::new(Vec::new())),
            subagents_tx: Arc::new(subagents_tx),
            subagents_rx,
            pending_tools: Arc::new(Mutex::new(Vec::new())),
            activity_tx: Arc::new(activity_tx),
            activity_rx,
            transcript_path: Arc::new(Mutex::new(None)),
            tailer: Arc::new(Mutex::new(None)),
        })
    }

    /// The recent screen, replayed to a viewport on attach.
    pub fn snapshot(&self) -> String {
        self.scrollback
            .lock()
            .map(|buffer| buffer.snapshot())
            .unwrap_or_default()
    }

    pub fn status(&self) -> Status {
        *self.status_rx.borrow()
    }

    /// Records an authoritative status from an agent hook (its turn finished, or it needs input),
    /// overriding the PTY parser until the next user input.
    pub fn set_hook_status(&self, status: Status) {
        self.settled.store(true, Ordering::Relaxed);
        let _ = self.status_tx.send(status);
    }

    /// The user sent input: the agent is working again. Starts a fresh turn, so the parser resumes
    /// (and is enabled for the first time, if this is the session's first input).
    pub fn mark_active(&self) {
        self.activated.store(true, Ordering::Relaxed);
        self.settled.store(false, Ordering::Relaxed);
        // A fresh turn: restart the idle-decay clock so the (about to be busy) agent isn't decayed.
        if let Ok(mut at) = self.last_activity.lock() {
            *at = Instant::now();
        }
        let _ = self.status_tx.send(Status::Thinking);
    }

    /// A tool is starting mid-turn (Claude's PreToolUse). Keeps the tab running and refreshes the
    /// idle-decay clock — but, unlike a user prompt, never un-settles a finished turn: hooks deliver
    /// out of order, and a late PreToolUse arriving after Stop/Notification must not resurrect a tab
    /// that already went Done/Idle (which then sticks on "running" because Claude's blinking prompt
    /// keeps the PTY from ever going quiet enough to decay).
    pub fn mark_tool_active(&self) {
        if self.settled.load(Ordering::Relaxed) {
            return;
        }
        if let Ok(mut at) = self.last_activity.lock() {
            *at = Instant::now();
        }
        let _ = self.status_tx.send(Status::Thinking);
    }

    /// A live feed of output frames produced after this call.
    pub fn subscribe_output(&self) -> broadcast::Receiver<String> {
        self.output_tx.subscribe()
    }

    /// A watch on the agent status; the current value is available immediately.
    pub fn subscribe_status(&self) -> watch::Receiver<Status> {
        self.status_rx.clone()
    }

    /// A live feed of chat events parsed from the transcript after this call.
    pub fn subscribe_chat(&self) -> broadcast::Receiver<ChatEvent> {
        self.chat_tx.subscribe()
    }

    /// The chat events accumulated so far, replayed to a viewport on attach.
    pub fn chat_snapshot(&self) -> Vec<ChatEvent> {
        self.chat_log
            .lock()
            .map(|log| log.clone())
            .unwrap_or_default()
    }

    /// The sub-agents spawned this turn (Claude `Task` calls), each with its live status.
    pub fn subagents(&self) -> Vec<SubAgent> {
        self.subagents_rx.borrow().clone()
    }

    /// A watch on the sub-agent list; the current value is available immediately.
    pub fn subscribe_subagents(&self) -> watch::Receiver<Vec<SubAgent>> {
        self.subagents_rx.clone()
    }

    /// The agent's current activity (latest in-progress tool), or `None` when it isn't running one.
    pub fn activity(&self) -> Option<String> {
        self.activity_rx.borrow().clone()
    }

    /// A watch on the current activity; the current value is available immediately.
    pub fn subscribe_activity(&self) -> watch::Receiver<Option<String>> {
        self.activity_rx.clone()
    }

    /// Points the chat view at the agent's JSONL transcript and tails it: existing lines seed the
    /// log, appended ones stream live. Idempotent for the same path; a new path (resume / fresh
    /// conversation) replaces the tailer and clears the log.
    pub fn start_transcript(&self, path: PathBuf) {
        {
            let Ok(mut current) = self.transcript_path.lock() else {
                return;
            };
            if current.as_deref() == Some(path.as_path()) {
                return;
            }
            *current = Some(path.clone());
        }

        if let Ok(mut tailer) = self.tailer.lock()
            && let Some(handle) = tailer.take()
        {
            handle.abort();
        }
        if let Ok(mut log) = self.chat_log.lock() {
            log.clear();
        }
        // A fresh conversation starts with no running sub-agents and no activity.
        if let Ok(mut active) = self.active_subagents.lock() {
            active.clear();
        }
        if let Ok(mut pending) = self.pending_tools.lock() {
            pending.clear();
        }
        let _ = self.subagents_tx.send(Vec::new());
        let _ = self.activity_tx.send(None);

        let chat_tx = self.chat_tx.clone();
        let chat_log = self.chat_log.clone();
        let active_subagents = self.active_subagents.clone();
        let subagents_tx = self.subagents_tx.clone();
        let pending_tools = self.pending_tools.clone();
        let activity_tx = self.activity_tx.clone();
        let last_activity = self.last_activity.clone();
        let provider = self.provider;
        // The provider owns the transcript format; an unknown provider parses nothing (no chat).
        let parse = move |line: &str| {
            provider
                .map(|p| p.parse_transcript_line(line))
                .unwrap_or_default()
        };
        let handle = tokio::spawn(async move {
            tailer::tail(path, parse, |events| {
                if let Ok(mut log) = chat_log.lock() {
                    log.extend(events.iter().cloned());
                }
                // A growing transcript means the agent is alive: keep the idle-decay clock fresh even
                // when the terminal isn't repainting (e.g. a long, silent high-effort thinking pass),
                // so the safety net only trips on a genuinely finished turn whose Stop hook was missed.
                if !events.is_empty()
                    && let Ok(mut at) = last_activity.lock()
                {
                    *at = Instant::now();
                }
                // Update the sub-agent set; publish the list only when it changed.
                if let Ok(mut active) = active_subagents.lock()
                    && track_subagents(&mut active, &events)
                {
                    let list = active.iter().map(|(_, sub)| sub.clone()).collect();
                    let _ = subagents_tx.send(list);
                }
                // Update the current activity (latest in-progress tool); publish on change.
                if let Ok(mut pending) = pending_tools.lock()
                    && track_activity(&mut pending, &events)
                {
                    let _ = activity_tx.send(pending.last().map(|(_, label)| label.clone()));
                }
                for event in events {
                    let _ = chat_tx.send(event);
                }
            })
            .await;
        })
        .abort_handle();

        if let Ok(mut slot) = self.tailer.lock() {
            *slot = Some(handle);
        }
    }

    pub fn write(&self, data: &str) {
        if let Ok(mut writer) = self.writer.lock() {
            let _ = writer.write_all(data.as_bytes());
            let _ = writer.flush();
        }
    }

    /// Resizes the PTY. Only the controlling viewport resizes (gated by the caller), so the terminal
    /// tracks whoever is driving, not a war between differently sized viewers.
    pub fn resize(&self, cols: u16, rows: u16) {
        if let Ok(master) = self.master.lock() {
            let _ = master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    }

    /// Kills the child; the reader thread then observes EOF and exits.
    pub fn shutdown(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        if let Ok(mut tailer) = self.tailer.lock()
            && let Some(handle) = tailer.take()
        {
            handle.abort();
        }
        if let Some(handle) = self.decay_handle.take() {
            handle.abort();
        }
        self.shutdown();
        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }
    }
}

fn spawn_reader(
    mut reader: Box<dyn Read + Send>,
    provider: Option<&'static dyn Provider>,
    scrollback: Arc<Mutex<ScrollbackBuffer>>,
    output_tx: broadcast::Sender<String>,
    status_tx: Arc<watch::Sender<Status>>,
    settled: Arc<AtomicBool>,
    activated: Arc<AtomicBool>,
    last_activity: Arc<Mutex<Instant>>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut decoder = Utf8Decoder::default();
        let mut status_state = StatusState::new();
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let text = decoder.push(&buffer[..read]);
                    if text.is_empty() {
                        continue;
                    }
                    if let Ok(mut sb) = scrollback.lock() {
                        sb.append(&text);
                    }
                    // Output means the agent is doing something: keep the idle-decay clock fresh.
                    if let Ok(mut at) = last_activity.lock() {
                        *at = Instant::now();
                    }
                    // The parser only runs after the user starts a turn (so startup / resume replay
                    // can't set a phantom status, and its internal state doesn't drift on that
                    // output), and while a hook hasn't settled the status for this turn. The signal
                    // itself comes from the session's provider; an unknown provider yields none.
                    if activated.load(Ordering::Relaxed)
                        && !settled.load(Ordering::Relaxed)
                        && let Some(status) =
                            status_state.update(provider.and_then(|p| p.parse_status(&text)))
                    {
                        let _ = status_tx.send(status);
                    }
                    let _ = output_tx.send(text);
                }
            }
        }
    })
}

/// The idle-decay safety net: while a session is `Thinking` with no settling hook, watch for the
/// PTY going quiet for `IDLE_AFTER` and fall it back to `Idle`. A clean turn ends via the `Stop`
/// hook (which settles to `Done` first), so this only catches a hook that never fired — without it
/// a session whose Stop hook is missed would show "running" forever. Returns `None` (no safety net)
/// when spawned outside a tokio runtime, e.g. a unit test that builds a `Session` directly.
fn spawn_idle_decay(
    status_tx: Arc<watch::Sender<Status>>,
    status_rx: watch::Receiver<Status>,
    settled: Arc<AtomicBool>,
    last_activity: Arc<Mutex<Instant>>,
) -> Option<AbortHandle> {
    if tokio::runtime::Handle::try_current().is_err() {
        return None;
    }
    let handle = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(IDLE_CHECK_EVERY);
        loop {
            ticker.tick().await;
            let quiet = last_activity
                .lock()
                .map(|at| at.elapsed() >= IDLE_AFTER)
                .unwrap_or(false);
            if idle_decay_due(*status_rx.borrow(), settled.load(Ordering::Relaxed), quiet) {
                let _ = status_tx.send(Status::Idle);
            }
        }
    });
    Some(handle.abort_handle())
}

/// Claude's sub-agent spawn tool, named `Task` historically and renamed to `Agent` in Claude Code
/// 2.1. Accept both so sub-agents surface (and aren't mistaken for the tab's own activity)
/// regardless of the installed CLI version.
fn is_subagent_tool(name: &str) -> bool {
    name == "Task" || name == "Agent"
}

/// Applies transcript events to the sub-agent set for the current turn: a new user prompt clears it,
/// a sub-agent tool-use adds a running one (keyed by its id, labelled by its parsed body — the task
/// description), and its tool-result *removes* it (the card shows only what's still running, so a
/// finished sub-agent drops off). Returns whether the set changed, so the caller only republishes on
/// a real change.
fn track_subagents(active: &mut Vec<(String, SubAgent)>, events: &[ChatEvent]) -> bool {
    let mut changed = false;
    for event in events {
        match event {
            // A real user prompt (not a tool result) starts a new turn.
            ChatEvent::User { .. } => {
                if !active.is_empty() {
                    active.clear();
                    changed = true;
                }
            }
            ChatEvent::Tool { id, name, body, .. } if is_subagent_tool(name) => {
                let name = body.clone().unwrap_or_else(|| "sub-agent".to_string());
                active.push((
                    id.clone(),
                    SubAgent {
                        name,
                        status: Status::Thinking,
                    },
                ));
                changed = true;
            }
            // The sub-agent finished (or errored): it's no longer running, so drop it from the list.
            ChatEvent::ToolResult { id, .. } => {
                let before = active.len();
                active.retain(|(tool_id, _)| tool_id != id);
                changed |= active.len() != before;
            }
            _ => {}
        }
    }
    changed
}

/// Tracks the in-progress non-`Task` tool calls (the last one is the agent's current activity): a
/// tool-use pushes one labelled by what it's doing, its tool-result pops it, and a new user prompt
/// clears them. Returns whether the set changed, so the caller only republishes on a real change.
fn track_activity(pending: &mut Vec<(String, String)>, events: &[ChatEvent]) -> bool {
    let mut changed = false;
    for event in events {
        match event {
            ChatEvent::User { .. } => {
                if !pending.is_empty() {
                    pending.clear();
                    changed = true;
                }
            }
            // Sub-agents surface on their own row, so they're not the tab's own activity.
            ChatEvent::Tool {
                id,
                name,
                path,
                body,
            } if !is_subagent_tool(name) => {
                // Keep only the most recent tool: the gray line shows one thing at a time, and we
                // deliberately hold on to it after the tool finishes so it stays visible while the
                // agent thinks between calls ("Unravelling…"). Only a new user prompt clears it.
                pending.clear();
                pending.push((
                    id.clone(),
                    activity_label(name, path.as_deref(), body.as_deref()),
                ));
                changed = true;
            }
            _ => {}
        }
    }
    changed
}

/// A short, human label for what a tool call is doing ("Editing config.ts", "Running pnpm test").
fn activity_label(name: &str, path: Option<&str>, body: Option<&str>) -> String {
    let file = || {
        path.map(|p| p.rsplit('/').next().unwrap_or(p).to_string())
            .filter(|f| !f.is_empty())
    };
    let clip = |s: &str| {
        let s = s.trim().replace('\n', " ");
        if s.chars().count() > 42 {
            format!("{}…", s.chars().take(42).collect::<String>())
        } else {
            s
        }
    };
    match name {
        "Bash" => body
            .map(|b| format!("Running {}", clip(b)))
            .unwrap_or_else(|| "Running command".to_string()),
        "Edit" | "MultiEdit" | "Write" => file()
            .map(|f| format!("Editing {f}"))
            .unwrap_or_else(|| "Editing files".to_string()),
        "Read" => file()
            .map(|f| format!("Reading {f}"))
            .unwrap_or_else(|| "Reading files".to_string()),
        "Grep" | "Glob" => body
            .map(|p| format!("Searching {}", clip(p)))
            .unwrap_or_else(|| "Searching".to_string()),
        other => other.to_string(),
    }
}

/// Whether the idle-decay net should fire this tick. Only an unsettled `Thinking` decays: a
/// hook-settled Done/Waiting, or a real prompt (WaitingInput), holds until answered — a pending
/// prompt is quiet too, so silence alone must not clear it.
fn idle_decay_due(status: Status, settled: bool, quiet: bool) -> bool {
    status == Status::Thinking && !settled && quiet
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn opts(command: &str, args: Vec<String>) -> SessionOptions {
        SessionOptions {
            // The status / transcript tests drive the session with Claude-shaped output, so run it
            // under the Claude provider while launching a harmless stand-in binary as the command.
            agent: "claude".into(),
            command: command.into(),
            args,
            cwd: ".".into(),
            env: None,
            cols: 80,
            rows: 24,
        }
    }

    #[test]
    fn tracks_subagents_with_status_across_a_turn() {
        let mut active: Vec<(String, SubAgent)> = Vec::new();
        let labels = |active: &[(String, SubAgent)]| {
            active
                .iter()
                .map(|(_, s)| (s.name.clone(), s.status))
                .collect::<Vec<_>>()
        };

        // Two Task calls spawn two running sub-agents, labelled by their description.
        assert!(track_subagents(
            &mut active,
            &[
                ChatEvent::Tool {
                    id: "t1".into(),
                    name: "Task".into(),
                    path: None,
                    body: Some("Map v1 to v2".into()),
                },
                ChatEvent::Tool {
                    id: "t2".into(),
                    name: "Task".into(),
                    path: None,
                    body: Some("Rewrite encoder".into()),
                },
            ],
        ));
        assert_eq!(
            labels(&active),
            vec![
                ("Map v1 to v2".to_string(), Status::Thinking),
                ("Rewrite encoder".to_string(), Status::Thinking),
            ]
        );

        // A non-Task tool doesn't add a sub-agent.
        assert!(!track_subagents(
            &mut active,
            &[ChatEvent::Tool {
                id: "b1".into(),
                name: "Bash".into(),
                path: None,
                body: Some("ls".into()),
            }]
        ));

        // One sub-agent finishes: it drops off the list (the card shows only what's still running).
        assert!(track_subagents(
            &mut active,
            &[ChatEvent::ToolResult {
                id: "t1".into(),
                ok: true,
                text: "done".into(),
            }],
        ));
        assert_eq!(
            labels(&active),
            vec![("Rewrite encoder".to_string(), Status::Thinking)]
        );

        // A new user prompt starts a fresh turn and clears the set.
        assert!(track_subagents(
            &mut active,
            &[ChatEvent::User {
                text: "now do the next thing".into(),
            }],
        ));
        assert!(active.is_empty());
    }

    #[test]
    fn tracks_the_renamed_agent_tool_as_a_subagent() {
        // Claude Code 2.1 renamed the sub-agent tool `Task` -> `Agent`; both must be tracked.
        let mut active: Vec<(String, SubAgent)> = Vec::new();
        assert!(track_subagents(
            &mut active,
            &[ChatEvent::Tool {
                id: "a1".into(),
                name: "Agent".into(),
                path: None,
                body: Some("Find gift card features".into()),
            }],
        ));
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].1.name, "Find gift card features");
        assert_eq!(active[0].1.status, Status::Thinking);

        // And it must NOT be counted as the tab's own activity (it has its own row).
        let mut pending: Vec<(String, String)> = Vec::new();
        assert!(!track_activity(
            &mut pending,
            &[ChatEvent::Tool {
                id: "a1".into(),
                name: "Agent".into(),
                path: None,
                body: Some("Find gift card features".into()),
            }],
        ));
        assert!(pending.is_empty());
    }

    #[test]
    fn idle_decay_fires_only_for_a_quiet_unsettled_thinking() {
        // The one case that decays: working, no hook settled it, and the PTY has gone quiet.
        assert!(idle_decay_due(Status::Thinking, false, true));
        // A busy (not-yet-quiet) turn holds.
        assert!(!idle_decay_due(Status::Thinking, false, false));
        // A hook already settled this turn (Done/Waiting): never override it from silence.
        assert!(!idle_decay_due(Status::Thinking, true, true));
        // A real prompt is quiet too, but must stay until the user answers.
        assert!(!idle_decay_due(Status::WaitingInput, false, true));
        // Already idle / done: nothing to decay.
        assert!(!idle_decay_due(Status::Idle, false, true));
        assert!(!idle_decay_due(Status::Done, false, true));
    }

    #[test]
    fn captures_output_in_the_snapshot() {
        let session = Session::spawn(opts("/bin/echo", vec!["hi".into()])).unwrap();
        let mut found = false;
        for _ in 0..100 {
            if session.snapshot().contains("hi") {
                found = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(found, "snapshot was {:?}", session.snapshot());
    }

    #[tokio::test]
    async fn streams_output_and_accepts_input() {
        let session = Session::spawn(opts("/bin/cat", vec![])).unwrap();
        let mut rx = session.subscribe_output();
        session.write("ping\n");

        let echoed = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                match rx.recv().await {
                    Ok(chunk) if chunk.contains("ping") => break true,
                    Ok(_) => continue,
                    Err(_) => break false,
                }
            }
        })
        .await
        .unwrap_or(false);

        assert!(echoed);
        session.shutdown();
    }

    #[test]
    fn resize_does_not_error() {
        let session = Session::spawn(opts("/bin/cat", vec![])).unwrap();
        session.resize(120, 40);
        session.shutdown();
    }

    #[tokio::test]
    async fn tails_a_transcript_into_chat_events() {
        let session = Session::spawn(opts("/bin/cat", vec![])).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("transcript.jsonl");
        std::fs::write(
            &path,
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"hi\"}}\n",
        )
        .unwrap();

        session.start_transcript(path.clone());

        let mut found = false;
        for _ in 0..40 {
            if session
                .chat_snapshot()
                .iter()
                .any(|event| matches!(event, ChatEvent::User { text } if text == "hi"))
            {
                found = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(found, "chat was {:?}", session.chat_snapshot());
        session.shutdown();
    }

    #[test]
    fn a_late_tool_hook_does_not_resurrect_a_finished_turn() {
        let session = Session::spawn(opts("/bin/cat", vec![])).unwrap();

        session.mark_active(); // turn starts (UserPromptSubmit)
        assert_eq!(session.status(), Status::Thinking);
        session.set_hook_status(Status::Done); // Stop settles the turn
        assert_eq!(session.status(), Status::Done);

        // A PreToolUse delivered late (out of order, after Stop) must NOT flip it back to running.
        session.mark_tool_active();
        assert_eq!(session.status(), Status::Done);

        // But a fresh user prompt does start a new turn.
        session.mark_active();
        assert_eq!(session.status(), Status::Thinking);
        // And now a tool keeps that turn alive.
        session.mark_tool_active();
        assert_eq!(session.status(), Status::Thinking);
        session.shutdown();
    }

    #[test]
    fn parser_stays_quiet_until_the_first_turn() {
        let session = Session::spawn(opts("/bin/cat", vec![])).unwrap();

        // Startup / resume-replay output that looks like a prompt must not move the status yet.
        session.write("Allow write? (y/n)\n");
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(session.status(), Status::Idle);

        // After the user starts a turn, the parser drives status again.
        session.mark_active();
        session.write("Allow write? (y/n)\n");
        let mut became_waiting = false;
        for _ in 0..100 {
            if session.status() == Status::WaitingInput {
                became_waiting = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(became_waiting, "status was {:?}", session.status());
        session.shutdown();
    }

    #[test]
    fn declares_term_for_agent_tuis() {
        let session = Session::spawn(opts(
            "/bin/sh",
            vec!["-c".into(), "printf TERM=$TERM".into()],
        ))
        .unwrap();
        let mut found = false;
        for _ in 0..100 {
            if session.snapshot().contains("TERM=xterm-256color") {
                found = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(found, "snapshot was {:?}", session.snapshot());
    }
}
