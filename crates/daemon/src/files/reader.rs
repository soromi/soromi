use std::fs;
use std::io::Read;
use std::path::Path;

use super::paths::resolve_within;

const MAX_BYTES: u64 = 256 * 1024;

/// The result of reading a file within a workspace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileRead {
    pub content: String,
    /// The file was larger than the cap and only its head is returned.
    pub truncated: bool,
    /// The file looks binary (has a null byte); content is empty.
    pub binary: bool,
}

impl FileRead {
    fn empty() -> Self {
        FileRead {
            content: String::new(),
            truncated: false,
            binary: false,
        }
    }
}

/// Reads a file within a workspace, read-only and size-capped. Guards against escapes.
pub fn read_file_within(root: &Path, path: &str) -> FileRead {
    match resolve_within(root, path).and_then(|target| read(&target)) {
        Some(read) => read,
        None => FileRead::empty(),
    }
}

fn read(target: &Path) -> Option<FileRead> {
    let meta = fs::metadata(target).ok()?;
    if !meta.is_file() {
        return None;
    }

    let to_read = meta.len().min(MAX_BYTES) as usize;
    let mut buffer = vec![0u8; to_read];
    fs::File::open(target).ok()?.read_exact(&mut buffer).ok()?;

    let binary = buffer.contains(&0);
    Some(FileRead {
        content: if binary {
            String::new()
        } else {
            String::from_utf8_lossy(&buffer).into_owned()
        },
        truncated: meta.len() > MAX_BYTES,
        binary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn reads_a_text_file() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "hello").unwrap();
        assert_eq!(
            read_file_within(dir.path(), "a.txt"),
            FileRead {
                content: "hello".into(),
                truncated: false,
                binary: false,
            }
        );
    }

    #[test]
    fn flags_a_binary_file_and_returns_no_content() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("bin"), [0x68u8, 0x00, 0x69]).unwrap();
        let result = read_file_within(dir.path(), "bin");
        assert!(result.binary);
        assert_eq!(result.content, "");
    }

    #[test]
    fn returns_empty_for_a_path_that_escapes_the_root() {
        let dir = tempdir().unwrap();
        assert_eq!(
            read_file_within(dir.path(), "../../etc/passwd"),
            FileRead::empty()
        );
    }

    #[test]
    fn returns_empty_for_a_directory() {
        let dir = tempdir().unwrap();
        assert_eq!(read_file_within(dir.path(), ".").content, "");
    }
}
