//! A connection's outbound side: the bounded queue every sender shares, the state the connection's
//! tasks agree on, and (optionally) a tally of what went out.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use soromi_protocol::{ServerMessage, TERMINAL_OUTPUT};
use tokio::sync::{Notify, mpsc};

/// How many frames may wait for the socket. A client this far behind is not keeping up: streams
/// hold back and re-sync, and anything that cannot wait ends the connection so the client starts
/// clean instead of drifting further out of date.
const QUEUE_CAPACITY: usize = 512;

/// One thing to put on the wire.
// Nearly every frame is a message, so boxing it to even out the variants would cost an allocation
// per frame to save space in a queue that holds a few hundred at most.
#[allow(clippy::large_enum_variant)]
#[derive(Debug)]
pub enum Frame {
    /// A protocol message, sent as JSON.
    Message(ServerMessage),
    /// Raw terminal output for the session the client was told `slot` belongs to.
    Terminal { slot: u16, data: String },
}

impl Frame {
    /// The bytes to send and what to call them in the stats: JSON for a message, or
    /// `[TERMINAL_OUTPUT][slot, big-endian][utf-8]` for terminal output.
    pub fn into_payload(self) -> Option<(Vec<u8>, bool)> {
        match self {
            Frame::Message(message) => Some((serde_json::to_vec(&message).ok()?, true)),
            Frame::Terminal { slot, data } => {
                let mut bytes = Vec::with_capacity(3 + data.len());
                bytes.push(TERMINAL_OUTPUT);
                bytes.extend_from_slice(&slot.to_be_bytes());
                bytes.extend_from_slice(data.as_bytes());
                Some((bytes, false))
            }
        }
    }
}

/// The queue could not take the frame: the connection is gone, or too far behind to keep.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Closed;

/// The sending half of a connection's queue, cloned into every task that writes to it.
#[derive(Clone)]
pub struct Outbound {
    tx: mpsc::Sender<Frame>,
    stalled: Arc<Notify>,
}

impl Outbound {
    /// A new queue: the sender, the receiver for the writer task, and a signal that fires when a
    /// reply found the queue full (the connection should then be dropped).
    pub fn channel() -> (Outbound, mpsc::Receiver<Frame>, Arc<Notify>) {
        let (tx, rx) = mpsc::channel(QUEUE_CAPACITY);
        let stalled = Arc::new(Notify::new());
        let outbound = Outbound {
            tx,
            stalled: stalled.clone(),
        };
        (outbound, rx, stalled)
    }

    /// Queues a reply or a one-off notice without waiting. If the queue is full the client is too
    /// far behind to be worth keeping, so the connection is flagged to close.
    pub fn send(&self, message: ServerMessage) -> Result<(), Closed> {
        match self.tx.try_send(Frame::Message(message)) {
            Ok(()) => Ok(()),
            Err(mpsc::error::TrySendError::Full(_)) => {
                self.stalled.notify_one();
                Err(Closed)
            }
            Err(mpsc::error::TrySendError::Closed(_)) => Err(Closed),
        }
    }

    /// Queues a frame from a live stream, waiting for room. While it waits the stream's source
    /// keeps filling its own buffer, which is what lets a stream notice it fell behind and re-sync.
    pub async fn stream(&self, frame: Frame) -> Result<(), Closed> {
        self.tx.send(frame).await.map_err(|_| Closed)
    }

    /// [`Outbound::stream`] for a protocol message.
    pub async fn stream_message(&self, message: ServerMessage) -> Result<(), Closed> {
        self.stream(Frame::Message(message)).await
    }
}

/// What a connection's tasks need to agree on about the client at the other end.
#[derive(Default)]
pub struct LinkState {
    /// The protocol version the client announced; 0 until it says hello.
    protocol: AtomicU32,
    /// Whether a client is on the other end. Always true on a local link; on a relay link the
    /// daemon stays connected to the relay with nobody there, and nothing should be sent then.
    present: AtomicBool,
    /// Directories this client has listed, so it is only told about changes in those.
    listed: Mutex<HashSet<(String, String)>>,
    /// Counts the clients this link has had, so a task can tell that what it remembers sending
    /// went to an earlier one.
    client: AtomicU32,
}

impl LinkState {
    pub fn new(present: bool) -> Self {
        Self {
            present: AtomicBool::new(present),
            ..Self::default()
        }
    }

    /// Whether there is a client to talk to: one is on the other end and has said hello with a
    /// protocol this daemon speaks. Until then the only thing sent is the answer to its hello.
    pub fn is_ready(&self) -> bool {
        self.present.load(Ordering::Relaxed) && self.protocol.load(Ordering::Relaxed) != 0
    }

    pub fn set_protocol(&self, protocol: u32) {
        self.protocol.store(protocol, Ordering::Relaxed);
    }

    /// Records whether a client is there; returns whether that changed.
    pub fn set_present(&self, present: bool) -> bool {
        self.present.swap(present, Ordering::Relaxed) != present
    }

    pub fn mark_listed(&self, workspace: &str, path: &str) {
        if let Ok(mut listed) = self.listed.lock() {
            listed.insert((workspace.to_string(), path.to_string()));
        }
    }

    pub fn has_listed(&self, workspace: &str, path: &str) -> bool {
        self.listed
            .lock()
            .map(|listed| listed.contains(&(workspace.to_string(), path.to_string())))
            .unwrap_or(false)
    }

    /// Which client this is, counting from the first; changes every time the link is reset.
    pub fn client(&self) -> u32 {
        self.client.load(Ordering::Relaxed)
    }

    /// Forgets everything about the client: it left, or a new one took its place.
    pub fn reset(&self) {
        self.client.fetch_add(1, Ordering::Relaxed);
        self.protocol.store(0, Ordering::Relaxed);
        if let Ok(mut listed) = self.listed.lock() {
            listed.clear();
        }
    }
}

/// Frames and bytes sent on one connection, by kind. Kept only when `SOROMI_WIRE_STATS` is set; it
/// is the baseline for judging any change to what goes on the wire.
#[derive(Default)]
pub struct WireStats {
    by_kind: HashMap<String, (u64, u64)>,
}

impl WireStats {
    /// A tally, if the environment asks for one.
    pub fn from_env() -> Option<Arc<Mutex<WireStats>>> {
        std::env::var_os("SOROMI_WIRE_STATS").map(|_| Arc::new(Mutex::new(WireStats::default())))
    }

    pub fn record(&mut self, kind: &str, bytes: usize) {
        let entry = self.by_kind.entry(kind.to_string()).or_default();
        entry.0 += 1;
        entry.1 += bytes as u64;
    }

    /// One line per kind, largest first, with a total.
    pub fn report(&self) -> String {
        let mut rows: Vec<(&String, &(u64, u64))> = self.by_kind.iter().collect();
        rows.sort_by(|a, b| b.1.1.cmp(&a.1.1).then(a.0.cmp(b.0)));
        let (frames, bytes) = rows
            .iter()
            .fold((0, 0), |sum, (_, row)| (sum.0 + row.0, sum.1 + row.1));
        let mut out = format!("{frames} frames, {bytes} bytes");
        for (kind, (frames, bytes)) in rows {
            out.push_str(&format!("\n  {kind}: {frames} frames, {bytes} bytes"));
        }
        out
    }
}

/// The `type` tag of an encoded message. The tag is always the first field, so this reads it off
/// the front of the JSON without parsing the rest.
pub fn message_kind(json: &[u8]) -> &str {
    const PREFIX: &[u8] = b"{\"type\":\"";
    json.strip_prefix(PREFIX)
        .and_then(|rest| {
            let end = rest.iter().position(|byte| *byte == b'"')?;
            std::str::from_utf8(&rest[..end]).ok()
        })
        .unwrap_or("unknown")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_terminal_frame_is_opcode_slot_then_bytes() {
        let (bytes, text) = Frame::Terminal {
            slot: 0x0102,
            data: "hi".into(),
        }
        .into_payload()
        .unwrap();
        assert!(!text);
        assert_eq!(bytes, vec![TERMINAL_OUTPUT, 0x01, 0x02, b'h', b'i']);
    }

    #[test]
    fn a_message_frame_is_json_tagged_with_its_kind() {
        let (bytes, text) = Frame::Message(ServerMessage::Pong { nonce: 1 })
            .into_payload()
            .unwrap();
        assert!(text);
        assert_eq!(message_kind(&bytes), "pong");
        assert_eq!(message_kind(b"not json"), "unknown");
    }

    #[tokio::test]
    async fn a_full_queue_flags_the_connection_instead_of_growing() {
        let (out, mut rx, stalled) = Outbound::channel();
        for nonce in 0..QUEUE_CAPACITY as u32 {
            assert_eq!(out.send(ServerMessage::Pong { nonce }), Ok(()));
        }
        // Nothing is draining: the next reply is refused and the connection is flagged.
        assert_eq!(out.send(ServerMessage::Pong { nonce: 0 }), Err(Closed));
        tokio::time::timeout(std::time::Duration::from_secs(1), stalled.notified())
            .await
            .expect("stalled was signalled");
        // The frames already queued are intact and in order.
        assert!(matches!(
            rx.recv().await,
            Some(Frame::Message(ServerMessage::Pong { nonce: 0 }))
        ));
    }

    #[test]
    fn link_state_tracks_listed_directories_until_reset() {
        let link = LinkState::new(true);
        assert!(!link.has_listed("ws", "src"));
        link.mark_listed("ws", "src");
        link.set_protocol(2);
        assert!(link.has_listed("ws", "src") && link.is_ready());

        let client = link.client();
        link.reset();
        assert!(!link.has_listed("ws", "src") && !link.is_ready());
        assert_ne!(link.client(), client);
    }

    #[test]
    fn a_link_is_ready_only_with_a_client_that_said_hello() {
        // A relay link with nobody on the other end.
        let link = LinkState::new(false);
        link.set_protocol(2);
        assert!(!link.is_ready());
        assert!(link.set_present(true));
        assert!(link.is_ready());
        // A local link has its client from the start, but not its hello.
        assert!(!LinkState::new(true).is_ready());
    }

    #[test]
    fn stats_report_lists_the_heaviest_kind_first() {
        let mut stats = WireStats::default();
        stats.record("status", 40);
        stats.record("terminal", 900);
        stats.record("status", 40);
        assert_eq!(
            stats.report(),
            "3 frames, 980 bytes\n  terminal: 1 frames, 900 bytes\n  status: 2 frames, 80 bytes"
        );
    }
}
