use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use tokio::sync::{broadcast, watch};

use soromi_protocol::Status;

use super::decoder::Utf8Decoder;
use super::scrollback::ScrollbackBuffer;
use crate::status::state::StatusState;

const SCROLLBACK_BYTES: usize = 256 * 1024;
const OUTPUT_CAPACITY: usize = 2048;

/// How to launch a session's PTY. `env` of `None` inherits the daemon's environment.
pub struct SessionOptions {
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
    reader_handle: Option<JoinHandle<()>>,
}

impl Session {
    pub fn spawn(opts: SessionOptions) -> anyhow::Result<Self> {
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

        let reader_handle = spawn_reader(
            reader,
            scrollback.clone(),
            output_tx.clone(),
            status_tx.clone(),
            settled.clone(),
            activated.clone(),
        );

        Ok(Session {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            child: Arc::new(Mutex::new(child)),
            scrollback,
            output_tx,
            status_tx,
            status_rx,
            settled,
            activated,
            reader_handle: Some(reader_handle),
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

    pub fn write(&self, data: &str) {
        if let Ok(mut writer) = self.writer.lock() {
            let _ = writer.write_all(data.as_bytes());
            let _ = writer.flush();
        }
    }

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
        self.shutdown();
        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }
    }
}

fn spawn_reader(
    mut reader: Box<dyn Read + Send>,
    scrollback: Arc<Mutex<ScrollbackBuffer>>,
    output_tx: broadcast::Sender<String>,
    status_tx: Arc<watch::Sender<Status>>,
    settled: Arc<AtomicBool>,
    activated: Arc<AtomicBool>,
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
                    // The parser only runs after the user starts a turn (so startup / resume replay
                    // can't set a phantom status, and its internal state doesn't drift on that
                    // output), and while a hook hasn't settled the status for this turn.
                    if activated.load(Ordering::Relaxed)
                        && !settled.load(Ordering::Relaxed)
                        && let Some(status) = status_state.update(&text)
                    {
                        let _ = status_tx.send(status);
                    }
                    let _ = output_tx.send(text);
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn opts(command: &str, args: Vec<String>) -> SessionOptions {
        SessionOptions {
            command: command.into(),
            args,
            cwd: ".".into(),
            env: None,
            cols: 80,
            rows: 24,
        }
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

    #[test]
    fn parser_stays_quiet_until_the_first_turn() {
        let session = Session::spawn(opts("/bin/cat", vec![])).unwrap();

        // Startup / resume-replay output that mentions "done" must not move the status yet.
        session.write("all done\n");
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(session.status(), Status::Idle);

        // After the user starts a turn, the parser drives status again.
        session.mark_active();
        session.write("tests passed\n");
        let mut became_done = false;
        for _ in 0..100 {
            if session.status() == Status::Done {
                became_done = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(became_done, "status was {:?}", session.status());
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
