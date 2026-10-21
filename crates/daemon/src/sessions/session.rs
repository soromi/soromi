use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use tokio::sync::{broadcast, watch};
use tokio::task::AbortHandle;

use soromi_protocol::{ChatEvent, Status, SubAgent, ToolKind};

use super::chat_log::ChatLog;
use super::decoder::Utf8Decoder;
use super::screen::Screen;
use super::subagents::Subagents;
use crate::providers::{self, Provider};
use crate::status::state::StatusState;
use crate::transcript::{self, tailer};

const OUTPUT_CAPACITY: usize = 2048;

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

/// One step of a terminal's output, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Output {
    /// Text the program wrote.
    Data(String),
    /// The terminal changed size; what follows is drawn for the new one.
    Resized { cols: u16, rows: u16 },
}

/// A terminal as it stands, for a viewer to start from.
pub struct Snapshot {
    pub cols: u16,
    pub rows: u16,
    /// Output that redraws the terminal (its history, screen, cursor and modes) on a viewport's
    /// terminal of this size that was just reset.
    pub repaint: String,
}

/// Owns one PTY. A reader thread pumps output into a headless screen and a broadcast channel,
/// and derives the agent status from that output (exposed as a watch channel). Cheap to clone
/// via `Arc` so the transport can share it across connections.
pub struct Session {
    /// This session's provider (resolved from the launch command), which owns the status- and
    /// transcript-parsing heuristics. `None` for an unrecognized command: raw terminal, no parsing.
    provider: Option<&'static dyn Provider>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    /// The terminal as the program sees it, kept up to date with every byte of output.
    screen: Arc<Mutex<Screen>>,
    output_tx: broadcast::Sender<Output>,
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
    /// Turns `true` once the program has ended and its output with it (it exited, or was stopped).
    ended_rx: watch::Receiver<bool>,
    /// The idle-decay task, aborted on Drop.
    decay_handle: Option<AbortHandle>,
    /// Structured chat events parsed from the agent's transcript, for viewers to follow. Empty
    /// until a transcript is attached (Claude only).
    chat_log: Arc<ChatLog>,
    /// Sub-agents the agent has spawned this turn, as `(tool_use_id, sub-agent)`, derived from
    /// `Task` tool-uses in the transcript: a use adds a running one, its result marks it done (or
    /// blocked on error), and a new user prompt clears the lot. Surfaced per-tab in the sidebar; the
    /// watch channel mirrors the list so a change can trigger a workspace re-broadcast.
    active_subagents: Arc<Mutex<Subagents>>,
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
                for (key, value) in crate::system::child_env() {
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

        let screen = Arc::new(Mutex::new(Screen::new(opts.cols, opts.rows)));
        let (output_tx, _) = broadcast::channel(OUTPUT_CAPACITY);
        let (status_tx, status_rx) = watch::channel(Status::Idle);
        let status_tx = Arc::new(status_tx);
        let settled = Arc::new(AtomicBool::new(false));
        let activated = Arc::new(AtomicBool::new(false));
        let last_activity = Arc::new(Mutex::new(Instant::now()));
        let (ended_tx, ended_rx) = watch::channel(false);

        let reader_handle = spawn_reader(
            reader,
            provider,
            screen.clone(),
            output_tx.clone(),
            status_tx.clone(),
            settled.clone(),
            activated.clone(),
            last_activity.clone(),
            ended_tx,
        );
        let decay_handle = spawn_idle_decay(
            status_tx.clone(),
            status_rx.clone(),
            settled.clone(),
            last_activity.clone(),
        );

        let (subagents_tx, subagents_rx) = watch::channel(Vec::new());
        let (activity_tx, activity_rx) = watch::channel(None);

        Ok(Session {
            provider,
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            child: Arc::new(Mutex::new(child)),
            screen,
            output_tx,
            status_tx,
            status_rx,
            settled,
            activated,
            last_activity,
            reader_handle: Some(reader_handle),
            ended_rx,
            decay_handle,
            chat_log: Arc::new(ChatLog::new(Vec::new())),
            active_subagents: Arc::new(Mutex::new(Subagents::default())),
            subagents_tx: Arc::new(subagents_tx),
            subagents_rx,
            pending_tools: Arc::new(Mutex::new(Vec::new())),
            activity_tx: Arc::new(activity_tx),
            activity_rx,
            transcript_path: Arc::new(Mutex::new(None)),
            tailer: Arc::new(Mutex::new(None)),
        })
    }

    /// Output that redraws the terminal as it stands (its history, screen, cursor and modes) on a
    /// viewport's terminal that was just reset.
    pub fn snapshot(&self) -> String {
        self.screen
            .lock()
            .map(|screen| screen.repaint())
            .unwrap_or_default()
    }

    /// The terminal's size, as `(columns, rows)`.
    pub fn size(&self) -> (u16, u16) {
        self.screen
            .lock()
            .map(|screen| screen.size())
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
    pub fn subscribe_output(&self) -> broadcast::Receiver<Output> {
        self.output_tx.subscribe()
    }

    /// The terminal as it stands and a feed of everything after it, taken together: the receiver
    /// starts exactly where the snapshot ends, so applying one then the other neither drops nor
    /// repeats output, and a later change of size arrives in its place among the output. Used on
    /// attach, and again to repaint a viewer that fell too far behind.
    pub fn attach_output(&self) -> (Snapshot, broadcast::Receiver<Output>) {
        match self.screen.lock() {
            Ok(screen) => {
                let (cols, rows) = screen.size();
                let snapshot = Snapshot {
                    cols,
                    rows,
                    repaint: screen.repaint(),
                };
                (snapshot, self.output_tx.subscribe())
            }
            Err(_) => {
                let snapshot = Snapshot {
                    cols: 0,
                    rows: 0,
                    repaint: String::new(),
                };
                (snapshot, self.output_tx.subscribe())
            }
        }
    }

    /// The agent transcript this session's chat follows, once it is known.
    pub fn transcript(&self) -> Option<PathBuf> {
        self.transcript_path.lock().ok()?.clone()
    }

    /// A watch that turns `true` once the program has ended (a shell that was `exit`ed, say).
    pub fn subscribe_ended(&self) -> watch::Receiver<bool> {
        self.ended_rx.clone()
    }

    /// A watch on the agent status; the current value is available immediately.
    pub fn subscribe_status(&self) -> watch::Receiver<Status> {
        self.status_rx.clone()
    }

    /// The chat events parsed from the transcript, for viewers to follow.
    pub fn chat_log(&self) -> &Arc<ChatLog> {
        &self.chat_log
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
        self.chat_log.restart();
        // A fresh conversation starts with no running sub-agents and no activity.
        if let Ok(mut active) = self.active_subagents.lock() {
            active.clear();
        }
        if let Ok(mut pending) = self.pending_tools.lock() {
            pending.clear();
        }
        let _ = self.subagents_tx.send(Vec::new());
        let _ = self.activity_tx.send(None);

        let chat_log = self.chat_log.clone();
        let active_subagents = self.active_subagents.clone();
        let subagents_tx = self.subagents_tx.clone();
        let pending_tools = self.pending_tools.clone();
        let activity_tx = self.activity_tx.clone();
        let last_activity = self.last_activity.clone();
        let provider = self.provider;
        // The provider owns the transcript format; an unknown provider parses nothing (no chat).
        // Each entry is read once, where it first appears: a provider may write old messages again
        // further down (Claude does when it compacts), and those are not new.
        let reader = Arc::new(Mutex::new(transcript::Reader::new(provider)));
        let parse = {
            let reader = reader.clone();
            let active_subagents = active_subagents.clone();
            let subagents_tx = subagents_tx.clone();
            move |line: &str| {
                let (events, tasks) = reader
                    .lock()
                    .map(|mut reader| reader.read_with_tasks(line))
                    .unwrap_or_default();
                // What the line says of background agents is taken in here, ahead of its events:
                // each line is parsed and then handed on, so the order of the transcript holds.
                if !tasks.is_empty()
                    && let Ok(mut active) = active_subagents.lock()
                    && active.apply(&tasks, &[])
                {
                    let _ = subagents_tx.send(active.list());
                }
                events
            }
        };
        // The file was replaced under us: what was read from the old one is void.
        let restart = {
            let chat_log = chat_log.clone();
            move || {
                if let Ok(mut reader) = reader.lock() {
                    reader.restart();
                }
                chat_log.restart();
            }
        };
        let handle = tokio::spawn(async move {
            let on_events = |events: Vec<ChatEvent>| {
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
                    && active.apply(&[], &events)
                {
                    let _ = subagents_tx.send(active.list());
                }
                // Update the current activity (latest in-progress tool); publish on change.
                if let Ok(mut pending) = pending_tools.lock()
                    && track_activity(&mut pending, &events)
                {
                    let _ = activity_tx.send(pending.last().map(|(_, label)| label.clone()));
                }
                chat_log.extend(events);
            };
            tailer::tail(path, parse, on_events, restart).await;
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
        // The headless screen follows, re-wrapping its history to the new width, and viewers are
        // told in step with the output: what the program draws next is for the new size.
        if let Ok(mut screen) = self.screen.lock()
            && screen.resize(cols, rows)
        {
            let (cols, rows) = screen.size();
            let _ = self.output_tx.send(Output::Resized { cols, rows });
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

#[allow(clippy::too_many_arguments)]
fn spawn_reader(
    mut reader: Box<dyn Read + Send>,
    provider: Option<&'static dyn Provider>,
    screen: Arc<Mutex<Screen>>,
    output_tx: broadcast::Sender<Output>,
    status_tx: Arc<watch::Sender<Status>>,
    settled: Arc<AtomicBool>,
    activated: Arc<AtomicBool>,
    last_activity: Arc<Mutex<Instant>>,
    ended_tx: watch::Sender<bool>,
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
                    // Apply and publish under one lock, so a viewer that takes the screen and a
                    // receiver together (`attach_output`) sees this chunk exactly once.
                    if let Ok(mut screen) = screen.lock() {
                        screen.feed(&text);
                        let _ = output_tx.send(Output::Data(text.clone()));
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
                }
            }
        }
        // The program is gone: nothing more will be read.
        let _ = ended_tx.send(true);
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

/// Current Unix time in seconds (for sub-agent start timestamps). Zero if the clock is before the
/// epoch, which never happens in practice.
pub(crate) fn now_secs() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as u32)
        .unwrap_or(0)
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
                tool_kind,
            } if *tool_kind != ToolKind::Agent => {
                // Keep only the most recent tool: the gray line shows one thing at a time, and we
                // deliberately hold on to it after the tool finishes so it stays visible while the
                // agent thinks between calls ("Unravelling…"). Only a new user prompt clears it.
                pending.clear();
                pending.push((
                    id.clone(),
                    activity_label(*tool_kind, name, path.as_deref(), body.as_deref()),
                ));
                changed = true;
            }
            _ => {}
        }
    }
    changed
}

/// A short, human label for what a tool call is doing ("Editing config.ts", "Running pnpm test").
/// Keyed off the provider-agnostic [`ToolKind`]; `name` is the fallback label for uncategorized tools.
fn activity_label(kind: ToolKind, name: &str, path: Option<&str>, body: Option<&str>) -> String {
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
    match kind {
        ToolKind::Run => body
            .map(|b| format!("Running {}", clip(b)))
            .unwrap_or_else(|| "Running command".to_string()),
        ToolKind::Edit | ToolKind::Write => file()
            .map(|f| format!("Editing {f}"))
            .unwrap_or_else(|| "Editing files".to_string()),
        ToolKind::Read => file()
            .map(|f| format!("Reading {f}"))
            .unwrap_or_else(|| "Reading files".to_string()),
        ToolKind::Search => body
            .map(|p| format!("Searching {}", clip(p)))
            .unwrap_or_else(|| "Searching".to_string()),
        _ => name.to_string(),
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
    async fn a_resize_is_announced_among_the_output_and_only_when_it_changes_the_size() {
        let session = Session::spawn(opts("/bin/cat", vec![])).unwrap();
        let (snapshot, mut rx) = session.attach_output();
        assert_eq!((snapshot.cols, snapshot.rows), (80, 24));

        session.resize(80, 24);
        session.resize(100, 30);
        session.resize(100, 30);
        assert_eq!(session.size(), (100, 30));

        let resized = tokio::time::timeout(Duration::from_secs(5), async {
            let mut seen = Vec::new();
            // Anything the shell printed comes first or after; exactly one resize is among it.
            while seen.is_empty() {
                match rx.recv().await {
                    Ok(Output::Resized { cols, rows }) => seen.push((cols, rows)),
                    Ok(Output::Data(_)) => continue,
                    Err(_) => break,
                }
            }
            seen
        })
        .await
        .unwrap_or_default();
        assert_eq!(resized, [(100, 30)]);
        assert!(matches!(
            rx.try_recv(),
            Err(broadcast::error::TryRecvError::Empty) | Ok(Output::Data(_))
        ));

        // A viewer arriving now starts from the new size.
        let (snapshot, _) = session.attach_output();
        assert_eq!((snapshot.cols, snapshot.rows), (100, 30));
        session.shutdown();
    }

    #[tokio::test]
    async fn streams_output_and_accepts_input() {
        let session = Session::spawn(opts("/bin/cat", vec![])).unwrap();
        let mut rx = session.subscribe_output();
        session.write("ping\n");

        let echoed = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                match rx.recv().await {
                    Ok(Output::Data(chunk)) if chunk.contains("ping") => break true,
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
                .chat_log()
                .snapshot()
                .iter()
                .any(|event| matches!(event, ChatEvent::User { text, .. } if text == "hi"))
            {
                found = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(found, "chat was {:?}", session.chat_log().snapshot());
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
