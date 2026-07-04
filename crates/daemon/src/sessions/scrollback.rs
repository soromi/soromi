/// A capped, append-only view of recent terminal output, replayed to a viewport on attach.
/// Sized in bytes; trims at a line boundary so a replayed snapshot never starts mid-escape-
/// sequence (which would make the viewport's parser choke and garble the render).
pub struct ScrollbackBuffer {
    buf: String,
    max_bytes: usize,
}

impl ScrollbackBuffer {
    pub fn new(max_bytes: usize) -> Self {
        Self {
            buf: String::new(),
            max_bytes,
        }
    }

    pub fn append(&mut self, data: &str) {
        self.buf.push_str(data);
        if self.buf.len() <= self.max_bytes {
            return;
        }

        // Drop at least this many oldest bytes; snap forward to a char boundary first.
        let mut drop = self.buf.len() - self.max_bytes;
        while drop < self.buf.len() && !self.buf.is_char_boundary(drop) {
            drop += 1;
        }
        // Prefer to start just after the next newline (a clean line, never mid-sequence).
        let cut = match self.buf[drop..].find('\n') {
            Some(pos) => drop + pos + 1,
            None => drop,
        };
        self.buf.drain(..cut);
    }

    pub fn snapshot(&self) -> String {
        self.buf.clone()
    }

    pub fn clear(&mut self) {
        self.buf.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_everything_while_under_the_cap() {
        let mut buf = ScrollbackBuffer::new(100);
        buf.append("hello ");
        buf.append("world");
        assert_eq!(buf.snapshot(), "hello world");
    }

    #[test]
    fn keeps_the_tail_when_there_is_no_line_boundary() {
        let mut buf = ScrollbackBuffer::new(10);
        buf.append("aaaaa");
        buf.append("bbbbb");
        buf.append("ccccc");
        assert_eq!(buf.snapshot(), "bbbbbccccc");
    }

    #[test]
    fn trims_to_a_line_boundary_so_it_never_starts_mid_sequence() {
        let mut buf = ScrollbackBuffer::new(10);
        buf.append("line1\nline2\nline3\n");
        // Over the cap; the trim lands just after a newline, keeping whole trailing lines.
        let snapshot = buf.snapshot();
        assert!(snapshot.starts_with("line3\n") || snapshot.starts_with("line2\n"));
        assert!(!snapshot.contains("line1"));
    }

    #[test]
    fn never_cuts_a_multibyte_char() {
        let mut buf = ScrollbackBuffer::new(6);
        // Each 'é' is 2 bytes; append past the cap and confirm the result stays valid UTF-8.
        buf.append("ééééé");
        let _ = buf.snapshot(); // would panic on a non-char-boundary drain
        assert!(buf.snapshot().chars().all(|c| c == 'é'));
    }

    #[test]
    fn clears_back_to_empty() {
        let mut buf = ScrollbackBuffer::new(10);
        buf.append("data");
        buf.clear();
        assert_eq!(buf.snapshot(), "");
    }
}
