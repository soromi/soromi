/// A capped, append-only view of recent terminal output. Replayed to a viewport when it
/// attaches, so a reconnecting client sees the recent screen without the daemon keeping
/// unbounded history. Sized in characters.
pub struct ScrollbackBuffer {
    chunks: Vec<String>,
    size: usize,
    max_chars: usize,
}

impl ScrollbackBuffer {
    pub fn new(max_chars: usize) -> Self {
        Self {
            chunks: Vec::new(),
            size: 0,
            max_chars,
        }
    }

    pub fn append(&mut self, data: &str) {
        self.chunks.push(data.to_string());
        self.size += data.chars().count();

        while self.size > self.max_chars && self.chunks.len() > 1 {
            let removed = self.chunks.remove(0);
            self.size -= removed.chars().count();
        }

        if self.size > self.max_chars && self.chunks.len() == 1 {
            let only = &self.chunks[0];
            let trimmed: String = only
                .chars()
                .skip(only.chars().count() - self.max_chars)
                .collect();
            self.size = trimmed.chars().count();
            self.chunks[0] = trimmed;
        }
    }

    pub fn snapshot(&self) -> String {
        self.chunks.concat()
    }

    pub fn clear(&mut self) {
        self.chunks.clear();
        self.size = 0;
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
    fn drops_whole_leading_chunks_once_over_the_cap() {
        let mut buf = ScrollbackBuffer::new(10);
        buf.append("aaaaa");
        buf.append("bbbbb");
        buf.append("ccccc");
        assert_eq!(buf.snapshot(), "bbbbbccccc");
    }

    #[test]
    fn trims_a_single_oversized_chunk_to_the_cap_keeping_the_tail() {
        let mut buf = ScrollbackBuffer::new(5);
        buf.append("0123456789");
        assert_eq!(buf.snapshot(), "56789");
    }

    #[test]
    fn clears_back_to_empty() {
        let mut buf = ScrollbackBuffer::new(10);
        buf.append("data");
        buf.clear();
        assert_eq!(buf.snapshot(), "");
    }
}
