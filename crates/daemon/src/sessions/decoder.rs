/// Incremental UTF-8 decoder. PTY reads land on arbitrary byte boundaries, so a multibyte
/// character can be split across two reads. This buffers an incomplete trailing sequence and
/// emits it once the continuation bytes arrive; genuinely invalid bytes become U+FFFD.
#[derive(Default)]
pub struct Utf8Decoder {
    pending: Vec<u8>,
}

impl Utf8Decoder {
    pub fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut out = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(text) => {
                    out.push_str(text);
                    self.pending.clear();
                    break;
                }
                Err(error) => {
                    let valid = error.valid_up_to();
                    if valid > 0 {
                        // SAFETY: `valid_up_to` marks a validated UTF-8 boundary.
                        out.push_str(unsafe {
                            std::str::from_utf8_unchecked(&self.pending[..valid])
                        });
                    }
                    match error.error_len() {
                        Some(len) => {
                            out.push('\u{FFFD}');
                            self.pending.drain(..valid + len);
                        }
                        None => {
                            // Incomplete tail: keep it and wait for more bytes.
                            self.pending.drain(..valid);
                            break;
                        }
                    }
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_ascii_through() {
        let mut decoder = Utf8Decoder::default();
        assert_eq!(decoder.push(b"hello"), "hello");
    }

    #[test]
    fn joins_a_multibyte_char_split_across_reads() {
        let mut decoder = Utf8Decoder::default();
        // 'é' is 0xC3 0xA9.
        assert_eq!(decoder.push(&[0xC3]), "");
        assert_eq!(decoder.push(&[0xA9]), "é");
    }

    #[test]
    fn replaces_invalid_bytes() {
        let mut decoder = Utf8Decoder::default();
        assert_eq!(decoder.push(&[0x68, 0xFF, 0x69]), "h\u{FFFD}i");
    }
}
