use base64::Engine;
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{Key, KeyInit, XChaCha20Poly1305, XNonce};
use tokio_tungstenite::tungstenite::Message;

use soromi_protocol::{ClientMessage, ServerMessage};

/// XChaCha20-Poly1305 uses a 24-byte nonce, prepended to each ciphertext frame.
const NONCE_LEN: usize = 24;

/// How frames are (de)serialized on a link. A local link is plaintext JSON (already trusted); the
/// relay link is XChaCha20-Poly1305, so the relay only ever forwards ciphertext.
pub enum Codec {
    Plain,
    Encrypted(Box<XChaCha20Poly1305>),
}

impl Codec {
    /// Builds an encrypted codec from a base64-encoded 32-byte key, or `None` if it is not valid.
    pub fn from_key_base64(key: &str) -> Option<Codec> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(key.trim())
            .ok()?;
        if bytes.len() != 32 {
            return None;
        }

        let cipher = XChaCha20Poly1305::new(Key::from_slice(&bytes));

        Some(Codec::Encrypted(Box::new(cipher)))
    }

    /// Encodes an outbound server message into a WebSocket frame.
    pub fn encode(&self, message: &ServerMessage) -> Option<Message> {
        let json = serde_json::to_vec(message).ok()?;

        match self {
            Codec::Plain => Some(Message::Text(String::from_utf8(json).ok()?)),
            Codec::Encrypted(cipher) => {
                let mut nonce = [0u8; NONCE_LEN];
                getrandom::getrandom(&mut nonce).ok()?;

                let ciphertext = cipher.encrypt(XNonce::from_slice(&nonce), json.as_ref()).ok()?;

                let mut frame = Vec::with_capacity(NONCE_LEN + ciphertext.len());
                frame.extend_from_slice(&nonce);
                frame.extend_from_slice(&ciphertext);

                Some(Message::Binary(frame))
            }
        }
    }

    /// Decodes an inbound WebSocket frame into a client message, or `None` if it cannot.
    pub fn decode(&self, message: Message) -> Option<ClientMessage> {
        match self {
            Codec::Plain => {
                let Message::Text(text) = message else {
                    return None;
                };
                serde_json::from_str(&text).ok()
            }
            Codec::Encrypted(cipher) => {
                let Message::Binary(frame) = message else {
                    return None;
                };
                if frame.len() < NONCE_LEN {
                    return None;
                }

                let (nonce, ciphertext) = frame.split_at(NONCE_LEN);
                let plaintext = cipher.decrypt(XNonce::from_slice(nonce), ciphertext).ok()?;

                serde_json::from_slice(&plaintext).ok()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A base64 32-byte key (all 0x01), just for tests.
    const KEY: &str = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";

    #[test]
    fn rejects_a_bad_key() {
        assert!(Codec::from_key_base64("not-base64!!").is_none());
        assert!(Codec::from_key_base64("QQ==").is_none()); // one byte, not 32
    }

    #[test]
    fn encrypted_frames_round_trip_and_are_binary() {
        let codec = Codec::from_key_base64(KEY).unwrap();

        let frame = codec.encode(&ServerMessage::UpToDate).unwrap();
        assert!(matches!(frame, Message::Binary(_)));

        // Re-decode: encode produces a ServerMessage frame; decode expects a ClientMessage frame,
        // so round-trip a ClientMessage through the same cipher instead.
        let client_frame = encrypt_client(&codec, &ClientMessage::ListWorkspaces);
        assert!(matches!(codec.decode(client_frame), Some(ClientMessage::ListWorkspaces)));
    }

    #[test]
    fn a_different_key_cannot_decrypt() {
        let sender = Codec::from_key_base64(KEY).unwrap();
        let other = Codec::from_key_base64("AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=").unwrap();

        let frame = encrypt_client(&sender, &ClientMessage::ListWorkspaces);
        assert!(other.decode(frame).is_none());
    }

    /// Encrypts a client message with a codec (mirrors `encode`, which is server-message-typed).
    fn encrypt_client(codec: &Codec, message: &ClientMessage) -> Message {
        let Codec::Encrypted(cipher) = codec else {
            unreachable!()
        };
        let json = serde_json::to_vec(message).unwrap();
        let mut nonce = [0u8; NONCE_LEN];
        getrandom::getrandom(&mut nonce).unwrap();
        let ciphertext = cipher.encrypt(XNonce::from_slice(&nonce), json.as_ref()).unwrap();
        let mut frame = nonce.to_vec();
        frame.extend_from_slice(&ciphertext);

        Message::Binary(frame)
    }
}
