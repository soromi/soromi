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

    #[test]
    fn is_lossless_across_every_split() {
        // A slice of what a TUI actually emits: ESC/CSI sequences plus dense multibyte
        // (box drawing, blocks, CJK). Feeding it one byte at a time is the harshest split.
        let text = "\u{1b}[59G Settings \u{1b}[?2026h ███░░░▓▓ café \u{1b}[0m 你好世界 \u{1b}[K";
        let bytes = text.as_bytes();

        for chunk_size in [1usize, 2, 3, 5, 7] {
            let mut decoder = Utf8Decoder::default();
            let mut out = String::new();
            for chunk in bytes.chunks(chunk_size) {
                out.push_str(&decoder.push(chunk));
            }
            assert_eq!(out, text, "lost bytes at chunk size {chunk_size}");
        }
    }
}
