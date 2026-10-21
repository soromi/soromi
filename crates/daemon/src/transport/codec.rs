use std::sync::Mutex;

use base64::Engine;
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{Key, KeyInit, XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use sha2::Sha256;
use tokio_tungstenite::tungstenite::Message;

/// The first byte of every frame on an encrypted link.
mod kind {
    /// Device to host: start a session. `[OPEN][version][device random]`.
    pub const OPEN: u8 = 0x01;
    /// Host to device: the session is on. `[ACCEPT][version][device random][host random]`.
    pub const ACCEPT: u8 = 0x02;
    /// Either way: `[DATA][counter, big-endian u64][ciphertext]`.
    pub const DATA: u8 = 0x03;
}

/// The version of the session handshake. A frame with another version is not answered.
const VERSION: u8 = 1;

/// Each side's contribution to a session's keys.
const RANDOM_LEN: usize = 32;

/// XChaCha20-Poly1305 takes a 24-byte nonce: sixteen zero bytes, then the frame's counter.
const NONCE_LEN: usize = 24;

/// Which end of a relay link this is. The host is the daemon; the device is the phone paired with
/// it (in this crate: the measuring client and the tests that stand in for one).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Role {
    Host,
    Device,
}

/// One direction of a session: its key, and the counter that numbers its frames.
struct Half {
    cipher: XChaCha20Poly1305,
    /// Sending: the last counter used. Receiving: the highest counter accepted.
    counter: u64,
}

impl Half {
    fn new(key: [u8; 32]) -> Self {
        Self {
            cipher: XChaCha20Poly1305::new(Key::from_slice(&key)),
            counter: 0,
        }
    }

    fn nonce(counter: u64) -> [u8; NONCE_LEN] {
        let mut nonce = [0u8; NONCE_LEN];
        nonce[NONCE_LEN - 8..].copy_from_slice(&counter.to_be_bytes());
        nonce
    }

    /// Encrypts the next frame in this direction.
    fn seal(&mut self, payload: &[u8]) -> Option<Vec<u8>> {
        let counter = self.counter.checked_add(1)?;
        let ciphertext = self
            .cipher
            .encrypt(XNonce::from_slice(&Self::nonce(counter)), payload)
            .ok()?;
        self.counter = counter;

        let mut frame = Vec::with_capacity(9 + ciphertext.len());
        frame.push(kind::DATA);
        frame.extend_from_slice(&counter.to_be_bytes());
        frame.extend_from_slice(&ciphertext);
        Some(frame)
    }

    /// Decrypts a data frame's body (`[counter][ciphertext]`). A counter that is not past every one
    /// already accepted is a frame seen before, sent again: it is refused.
    fn open(&mut self, body: &[u8]) -> Option<Vec<u8>> {
        let (counter, ciphertext) = body.split_first_chunk::<8>()?;
        let counter = u64::from_be_bytes(*counter);
        if counter <= self.counter {
            return None;
        }
        let payload = self
            .cipher
            .decrypt(XNonce::from_slice(&Self::nonce(counter)), ciphertext)
            .ok()?;
        self.counter = counter;
        Some(payload)
    }
}

/// Derives a session's two keys from the pairing secret and what each side contributed. Both
/// contributions are fresh for every session, so frames recorded from one session open under no
/// other, and each direction has its own key, so a frame cannot be turned back on its sender.
fn session_keys(
    secret: &[u8; 32],
    device_random: &[u8; RANDOM_LEN],
    host_random: &[u8; RANDOM_LEN],
) -> ([u8; 32], [u8; 32]) {
    let mut salt = [0u8; RANDOM_LEN * 2];
    salt[..RANDOM_LEN].copy_from_slice(device_random);
    salt[RANDOM_LEN..].copy_from_slice(host_random);

    let hkdf = Hkdf::<Sha256>::new(Some(&salt), secret);
    let mut device_to_host = [0u8; 32];
    let mut host_to_device = [0u8; 32];
    hkdf.expand(b"soromi relay v1 device to host", &mut device_to_host)
        .expect("32 bytes is a valid HKDF-SHA256 output length");
    hkdf.expand(b"soromi relay v1 host to device", &mut host_to_device)
        .expect("32 bytes is a valid HKDF-SHA256 output length");

    (device_to_host, host_to_device)
}

fn random() -> Option<[u8; RANDOM_LEN]> {
    let mut bytes = [0u8; RANDOM_LEN];
    getrandom::getrandom(&mut bytes).ok()?;
    Some(bytes)
}

/// The encrypted side of a relay link. The pairing secret never encrypts anything itself: a device
/// opens a session, each side contributes randomness, and the session's keys are derived from all
/// three. Until a session is on, nothing can be sent or read.
pub struct SecureLink {
    secret: [u8; 32],
    role: Role,
    send: Mutex<Option<Half>>,
    receive: Mutex<Option<Half>>,
    /// Device only: what it contributed to the session it asked for and has not had accepted yet.
    pending: Mutex<Option<[u8; RANDOM_LEN]>>,
}

/// A session a device asked the host for. The host is already reading with the session's keys; it
/// starts sending with them once `reply` is on its way, so that the device gets the reply before
/// anything encrypted for the session. See [`Codec::begin`].
pub struct SessionStart {
    reply: Vec<u8>,
    send: Half,
}

impl std::fmt::Debug for SessionStart {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SessionStart")
    }
}

/// What an inbound frame turned out to be.
pub enum Received {
    /// A payload: JSON, or a binary frame of the protocol.
    Payload(Vec<u8>),
    /// (Host) A device asked for a session. Whatever the previous session carried is void.
    Opened(SessionStart),
    /// (Device) The host accepted the session; frames can be exchanged.
    Accepted,
    /// Not a data frame, or one that could not be read: wrong key, sent again, or no session.
    Nothing,
}

/// How frames are (de)serialized on a link. A local link is plaintext JSON (already trusted); a
/// relay link is encrypted end to end, so the relay only ever forwards ciphertext.
pub enum Codec {
    Plain,
    Encrypted(Box<SecureLink>),
}

impl Codec {
    /// The host's end of an encrypted link, from the pairing secret (a base64 32-byte key), or
    /// `None` if that is not one.
    pub fn from_key_base64(key: &str) -> Option<Codec> {
        Self::encrypted(key, Role::Host)
    }

    /// The device's end of an encrypted link: what a phone holds after pairing.
    pub fn device_from_key_base64(key: &str) -> Option<Codec> {
        Self::encrypted(key, Role::Device)
    }

    fn encrypted(key: &str, role: Role) -> Option<Codec> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(key.trim())
            .ok()?;
        let secret: [u8; 32] = bytes.try_into().ok()?;

        Some(Codec::Encrypted(Box::new(SecureLink {
            secret,
            role,
            send: Mutex::new(None),
            receive: Mutex::new(None),
            pending: Mutex::new(None),
        })))
    }

    /// Wraps an outbound payload in a WebSocket frame. On a plaintext link JSON goes out as a text
    /// frame and anything else as binary. On an encrypted link every payload is sealed into a
    /// binary data frame, and the receiver tells JSON from binary by the payload's first byte;
    /// with no session on there is nobody to seal it for, and the result is `None`.
    pub fn seal(&self, payload: Vec<u8>, text: bool) -> Option<Message> {
        match self {
            Codec::Plain if text => Some(Message::Text(String::from_utf8(payload).ok()?)),
            Codec::Plain => Some(Message::Binary(payload)),
            Codec::Encrypted(link) => {
                let mut send = link.send.lock().ok()?;
                Some(Message::Binary(send.as_mut()?.seal(&payload)?))
            }
        }
    }

    /// Reads an inbound WebSocket frame.
    pub fn receive(&self, message: Message) -> Received {
        let link = match self {
            Codec::Plain => {
                return match message {
                    Message::Text(text) => Received::Payload(text.into_bytes()),
                    Message::Binary(bytes) => Received::Payload(bytes),
                    _ => Received::Nothing,
                };
            }
            Codec::Encrypted(link) => link,
        };
        let Message::Binary(frame) = message else {
            return Received::Nothing;
        };
        let Some((kind, body)) = frame.split_first() else {
            return Received::Nothing;
        };
        match (*kind, link.role) {
            (kind::DATA, _) => link
                .receive
                .lock()
                .ok()
                .and_then(|mut receive| receive.as_mut()?.open(body))
                .map_or(Received::Nothing, Received::Payload),
            (kind::OPEN, Role::Host) => link
                .accept(body)
                .map_or(Received::Nothing, Received::Opened),
            (kind::ACCEPT, Role::Device) => {
                if link.accepted(body) {
                    Received::Accepted
                } else {
                    Received::Nothing
                }
            }
            _ => Received::Nothing,
        }
    }

    /// The payload of an inbound data frame, or `None` for anything else.
    pub fn open(&self, message: Message) -> Option<Vec<u8>> {
        match self.receive(message) {
            Received::Payload(payload) => Some(payload),
            _ => None,
        }
    }

    /// (Host) Puts a session's reply on the wire and starts sending with the session's keys.
    /// Returns the frame to send; every frame sealed after this call belongs to the session.
    pub fn begin(&self, start: SessionStart) -> Message {
        if let Codec::Encrypted(link) = self
            && let Ok(mut send) = link.send.lock()
        {
            *send = Some(start.send);
        }
        Message::Binary(start.reply)
    }

    /// (Device) Asks the host for a session. Returns the frame to send, or `None` on a link that
    /// has no sessions (plaintext, or the host's end).
    pub fn open_session(&self) -> Option<Message> {
        let Codec::Encrypted(link) = self else {
            return None;
        };
        if link.role != Role::Device {
            return None;
        }
        let device_random = random()?;
        *link.pending.lock().ok()? = Some(device_random);

        let mut frame = Vec::with_capacity(2 + RANDOM_LEN);
        frame.extend_from_slice(&[kind::OPEN, VERSION]);
        frame.extend_from_slice(&device_random);
        Some(Message::Binary(frame))
    }

    /// Ends the session: the other end left. Nothing can be sent or read until a new one is on.
    pub fn end_session(&self) {
        let Codec::Encrypted(link) = self else {
            return;
        };
        for half in [&link.send, &link.receive] {
            if let Ok(mut half) = half.lock() {
                *half = None;
            }
        }
        if let Ok(mut pending) = link.pending.lock() {
            *pending = None;
        }
    }
}

impl SecureLink {
    /// (Host) Answers a device's request for a session (`[version][device random]`). Reading
    /// switches to the session at once: the device sends nothing more until it has the reply.
    fn accept(&self, body: &[u8]) -> Option<SessionStart> {
        let (version, rest) = body.split_first()?;
        if *version != VERSION {
            return None;
        }
        let device_random: [u8; RANDOM_LEN] = rest.try_into().ok()?;
        let host_random = random()?;
        let (device_to_host, host_to_device) =
            session_keys(&self.secret, &device_random, &host_random);

        *self.receive.lock().ok()? = Some(Half::new(device_to_host));

        // The reply names the request it answers, so a device that asked twice knows which of its
        // requests the keys belong to.
        let mut reply = Vec::with_capacity(2 + RANDOM_LEN * 2);
        reply.extend_from_slice(&[kind::ACCEPT, VERSION]);
        reply.extend_from_slice(&device_random);
        reply.extend_from_slice(&host_random);
        Some(SessionStart {
            reply,
            send: Half::new(host_to_device),
        })
    }

    /// (Device) Takes the host's reply (`[version][device random][host random]`) and turns the
    /// session on. A reply to anything but the request still waiting is ignored.
    fn accepted(&self, body: &[u8]) -> bool {
        let Some((version, rest)) = body.split_first() else {
            return false;
        };
        let Some((device_random, host_random)) = rest.split_first_chunk::<RANDOM_LEN>() else {
            return false;
        };
        let Ok(host_random) = <[u8; RANDOM_LEN]>::try_from(host_random) else {
            return false;
        };
        let Ok(mut pending) = self.pending.lock() else {
            return false;
        };
        if *version != VERSION || pending.as_ref() != Some(device_random) {
            return false;
        }
        *pending = None;

        let (device_to_host, host_to_device) =
            session_keys(&self.secret, device_random, &host_random);
        let (Ok(mut send), Ok(mut receive)) = (self.send.lock(), self.receive.lock()) else {
            return false;
        };
        *send = Some(Half::new(device_to_host));
        *receive = Some(Half::new(host_to_device));
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A base64 32-byte key (all 0x01), just for tests.
    const KEY: &str = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    const OTHER: &str = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=";

    /// A host and a device with a session on between them.
    fn session(host_key: &str, device_key: &str) -> (Codec, Codec) {
        let host = Codec::from_key_base64(host_key).unwrap();
        let device = Codec::device_from_key_base64(device_key).unwrap();
        let open = device.open_session().unwrap();
        let Received::Opened(start) = host.receive(open) else {
            panic!("the host did not take the request");
        };
        let accepted = matches!(device.receive(host.begin(start)), Received::Accepted);
        assert!(accepted, "the device did not take the reply");
        (host, device)
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn rejects_a_bad_key() {
        assert!(Codec::from_key_base64("not-base64!!").is_none());
        assert!(Codec::from_key_base64("QQ==").is_none()); // one byte, not 32
    }

    #[test]
    fn payloads_cross_a_session_both_ways_as_binary_frames() {
        let (host, device) = session(KEY, KEY);

        let down = host
            .seal(b"{\"type\":\"up-to-date\"}".to_vec(), true)
            .unwrap();
        assert!(matches!(down, Message::Binary(_)));
        assert_eq!(
            device.open(down),
            Some(b"{\"type\":\"up-to-date\"}".to_vec())
        );

        let terminal = vec![0x01, 0x00, 0x02, b'h', b'i'];
        let up = device.seal(terminal.clone(), false).unwrap();
        assert_eq!(host.open(up), Some(terminal));
    }

    #[test]
    fn a_plaintext_link_passes_payloads_through() {
        let codec = Codec::Plain;
        let json = codec.seal(b"{}".to_vec(), true).unwrap();
        assert!(matches!(json, Message::Text(_)));
        assert_eq!(codec.open(json), Some(b"{}".to_vec()));

        let binary = codec.seal(vec![0x01, 0x02], false).unwrap();
        assert!(matches!(binary, Message::Binary(_)));
        assert_eq!(codec.open(binary), Some(vec![0x01, 0x02]));
        assert!(codec.open_session().is_none());
    }

    #[test]
    fn nothing_is_sent_or_read_without_a_session() {
        let host = Codec::from_key_base64(KEY).unwrap();
        assert!(host.seal(b"{}".to_vec(), true).is_none());

        let (other_host, device) = session(KEY, KEY);
        let frame = device.seal(b"{}".to_vec(), true).unwrap();
        assert_eq!(host.open(frame), None);

        // Ending a session closes it in both directions.
        other_host.end_session();
        assert!(other_host.seal(b"{}".to_vec(), true).is_none());
        assert_eq!(
            other_host.open(device.seal(b"{}".to_vec(), true).unwrap()),
            None
        );
    }

    #[test]
    fn a_different_secret_cannot_read_the_session() {
        let (host, device) = session(KEY, OTHER);
        assert_eq!(host.open(device.seal(b"{}".to_vec(), true).unwrap()), None);
        assert_eq!(device.open(host.seal(b"{}".to_vec(), true).unwrap()), None);
    }

    #[test]
    fn a_frame_sent_again_is_refused() {
        let (host, device) = session(KEY, KEY);
        let first = device.seal(b"one".to_vec(), true).unwrap();
        let second = device.seal(b"two".to_vec(), true).unwrap();

        assert_eq!(host.open(first.clone()), Some(b"one".to_vec()));
        assert_eq!(host.open(first.clone()), None);
        assert_eq!(host.open(second.clone()), Some(b"two".to_vec()));
        // Neither the latest frame nor an earlier one is taken twice.
        assert_eq!(host.open(second), None);
        assert_eq!(host.open(first), None);
        // The session carries on.
        let third = device.seal(b"three".to_vec(), true).unwrap();
        assert_eq!(host.open(third), Some(b"three".to_vec()));
    }

    #[test]
    fn a_frame_cannot_be_turned_back_on_its_sender() {
        let (host, device) = session(KEY, KEY);
        let frame = device.seal(b"{}".to_vec(), true).unwrap();
        assert_eq!(device.open(frame), None);
        let frame = host.seal(b"{}".to_vec(), true).unwrap();
        assert_eq!(host.open(frame), None);
    }

    #[test]
    fn frames_from_an_earlier_session_do_not_open_in_a_new_one() {
        let host = Codec::from_key_base64(KEY).unwrap();
        let device = Codec::device_from_key_base64(KEY).unwrap();

        let first_open = device.open_session().unwrap();
        let Received::Opened(start) = host.receive(first_open.clone()) else {
            panic!("no session");
        };
        device.receive(host.begin(start));
        let recorded = device.seal(b"rm -rf".to_vec(), true).unwrap();
        assert_eq!(host.open(recorded.clone()), Some(b"rm -rf".to_vec()));

        // Someone replays the whole recording: the same request, then the same frame. The host
        // contributes fresh randomness, so the session has other keys and the frame is noise.
        let Received::Opened(start) = host.receive(first_open) else {
            panic!("no session");
        };
        host.begin(start);
        assert_eq!(host.open(recorded), None);
    }

    #[test]
    fn a_reply_to_another_request_is_ignored() {
        let host = Codec::from_key_base64(KEY).unwrap();
        let device = Codec::device_from_key_base64(KEY).unwrap();

        // The device asks twice; the answer to the first request arrives after the second.
        let first = device.open_session().unwrap();
        let second = device.open_session().unwrap();
        let Received::Opened(stale) = host.receive(first) else {
            panic!("no session");
        };
        let stale_reply = host.begin(stale);
        let Received::Opened(current) = host.receive(second) else {
            panic!("no session");
        };
        let current_reply = host.begin(current);

        assert!(matches!(device.receive(stale_reply), Received::Nothing));
        assert!(matches!(
            device.receive(current_reply.clone()),
            Received::Accepted
        ));
        // An accepted reply is not taken a second time.
        assert!(matches!(device.receive(current_reply), Received::Nothing));

        let frame = device.seal(b"{}".to_vec(), true).unwrap();
        assert_eq!(host.open(frame), Some(b"{}".to_vec()));
    }

    #[test]
    fn each_end_only_takes_its_own_handshake_frames() {
        let host = Codec::from_key_base64(KEY).unwrap();
        let device = Codec::device_from_key_base64(KEY).unwrap();
        assert!(host.open_session().is_none());

        let open = device.open_session().unwrap();
        assert!(matches!(device.receive(open.clone()), Received::Nothing));
        let Received::Opened(start) = host.receive(open) else {
            panic!("no session");
        };
        let reply = host.begin(start);
        assert!(matches!(host.receive(reply), Received::Nothing));

        // A request for another version of the handshake is not answered.
        let mut unknown = vec![kind::OPEN, VERSION + 1];
        unknown.extend_from_slice(&[7u8; RANDOM_LEN]);
        assert!(matches!(
            host.receive(Message::Binary(unknown)),
            Received::Nothing
        ));
    }

    /// Fixed inputs and what they must produce. The client's test holds the same values, so the
    /// two implementations cannot drift apart unnoticed.
    #[test]
    fn keys_and_frames_match_the_shared_vector() {
        let (device_to_host, host_to_device) = session_keys(&[1u8; 32], &[2u8; 32], &[3u8; 32]);
        assert_eq!(
            hex(&device_to_host),
            "00ba1df2d8a13f87172100cef8c48be88465ec84594a5f01ae0303b66954281f"
        );
        assert_eq!(
            hex(&host_to_device),
            "022b03f0121374d4ad7e5a4366c942d6b7465c053b2d9804b2ed1f4b865f3bdb"
        );

        let mut half = Half::new(device_to_host);
        let frame = half.seal(b"{\"type\":\"ping\",\"nonce\":1}").unwrap();
        assert_eq!(
            hex(&frame),
            "030000000000000001c51c73157a6b2e8a9338a5a1b551f0b87e1f4f44d582079bb0b05c64629d77564f20fef250171fba05"
        );
    }
}
