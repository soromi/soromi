use std::fs;
use std::io::Read;
use std::path::Path;

use base64::Engine;

use super::paths::resolve_within;

const MAX_BYTES: u64 = 256 * 1024;

/// The pictures a viewer is sent to show, by extension, with the media type they are sent as.
const IMAGES: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("bmp", "image/bmp"),
    ("ico", "image/x-icon"),
    ("svg", "image/svg+xml"),
    ("avif", "image/avif"),
    ("heic", "image/heic"),
    ("heif", "image/heif"),
    ("tif", "image/tiff"),
    ("tiff", "image/tiff"),
];

/// The media type of a picture, by its file's extension; `None` for anything else.
pub fn image_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    IMAGES
        .iter()
        .find(|(known, _)| *known == extension)
        .map(|(_, media)| *media)
}

/// The result of reading a file within a workspace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileRead {
    pub content: String,
    /// The file was larger than the cap and only its head is returned.
    pub truncated: bool,
    /// The file looks binary (has a null byte); content is empty.
    pub binary: bool,
    /// The file is a picture of this media type: `content` is its bytes in base64, or empty when it
    /// is over the size the caller can send (then `truncated`).
    pub image: Option<String>,
}

impl FileRead {
    fn empty() -> Self {
        FileRead {
            content: String::new(),
            truncated: false,
            binary: false,
            image: None,
        }
    }
}

/// Reads a file within a workspace, read-only and size-capped. Guards against escapes. A picture is
/// read whole, to be shown, when it is no larger than `image_limit` bytes.
pub fn read_file_within(root: &Path, path: &str, image_limit: u64) -> FileRead {
    match resolve_within(root, path).and_then(|target| read(&target, image_limit)) {
        Some(read) => read,
        None => FileRead::empty(),
    }
}

/// Writes `content` to a file within a workspace, guarding against path escapes (same containment
/// check `read_file_within` uses). Overwrites an existing file; errors if the path escapes the root,
/// the parent doesn't exist, or the write fails. The editor only saves files it first read (so the
/// parent exists), and truncated/binary files are never editable.
pub fn write_file_within(root: &Path, path: &str, content: &str) -> std::io::Result<()> {
    let Some(target) = resolve_within(root, path) else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "path escapes the workspace root",
        ));
    };
    fs::write(target, content)
}

/// Moves a file or folder within a workspace to the system's Trash, where it can be restored from.
/// Refuses what would take the workspace apart: its root, or one of the folders it is made of
/// (`protected`, relative to the root; those are removed from the workspace in its settings).
pub fn trash_within(root: &Path, path: &str, protected: &[String]) -> std::io::Result<()> {
    let refuse = |why: &str| {
        Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            why,
        ))
    };
    let Some(target) = resolve_within(root, path) else {
        return refuse("path escapes the workspace root");
    };
    let is_part =
        |folder: &String| resolve_within(root, folder).as_deref() == Some(target.as_path());
    if resolve_within(root, "").as_deref() == Some(target.as_path())
        || protected.iter().any(is_part)
    {
        return refuse("that is one of the workspace's own folders");
    }
    // Not `exists()`: a link whose target is gone is still there to be moved.
    fs::symlink_metadata(&target)?;
    trash_context()
        .delete(&target)
        .map_err(|error| std::io::Error::other(error.to_string()))
}

/// On macOS the system's own call, not a script asking Finder to do it: that would need the user to
/// let Soromi control Finder, and would play Finder's sound on the computer for a phone's request.
fn trash_context() -> trash::TrashContext {
    #[allow(unused_mut)]
    let mut context = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        context.set_delete_method(DeleteMethod::NsFileManager);
    }
    context
}

fn read(target: &Path, image_limit: u64) -> Option<FileRead> {
    let meta = fs::metadata(target).ok()?;
    if !meta.is_file() {
        return None;
    }
    if let Some(media) = image_type(target) {
        let image = Some(media.to_string());
        if meta.len() > image_limit {
            return Some(FileRead {
                content: String::new(),
                truncated: true,
                binary: false,
                image,
            });
        }
        let bytes = fs::read(target).ok()?;
        return Some(FileRead {
            content: base64::engine::general_purpose::STANDARD.encode(bytes),
            truncated: false,
            binary: false,
            image,
        });
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
        image: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    const LIMIT: u64 = 1024;

    #[test]
    fn a_picture_is_sent_whole_to_be_shown() {
        let dir = tempdir().unwrap();
        // A PNG's own signature, with a null byte in it: read as text it would count as binary.
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];
        fs::write(dir.path().join("Shot.PNG"), png).unwrap();

        let read = read_file_within(dir.path(), "Shot.PNG", LIMIT);
        assert_eq!(read.image.as_deref(), Some("image/png"));
        assert!(!read.binary && !read.truncated);
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&read.content)
            .unwrap();
        assert_eq!(bytes, png);
    }

    #[test]
    fn a_picture_too_large_to_send_says_so_and_sends_nothing() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("big.jpg"), vec![7u8; 2048]).unwrap();

        let read = read_file_within(dir.path(), "big.jpg", LIMIT);
        assert_eq!(read.image.as_deref(), Some("image/jpeg"));
        assert!(read.truncated);
        assert!(read.content.is_empty());
    }

    #[test]
    fn only_known_picture_kinds_are_pictures() {
        assert_eq!(image_type(Path::new("a/logo.svg")), Some("image/svg+xml"));
        assert_eq!(image_type(Path::new("photo.jpeg")), Some("image/jpeg"));
        assert_eq!(image_type(Path::new("notes.txt")), None);
        assert_eq!(image_type(Path::new("png")), None);
    }

    #[test]
    fn reads_a_text_file() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "hello").unwrap();
        assert_eq!(
            read_file_within(dir.path(), "a.txt", LIMIT),
            FileRead {
                content: "hello".into(),
                truncated: false,
                binary: false,
                image: None,
            }
        );
    }

    #[test]
    fn flags_a_binary_file_and_returns_no_content() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("bin"), [0x68u8, 0x00, 0x69]).unwrap();
        let result = read_file_within(dir.path(), "bin", LIMIT);
        assert!(result.binary);
        assert_eq!(result.content, "");
    }

    #[test]
    fn returns_empty_for_a_path_that_escapes_the_root() {
        let dir = tempdir().unwrap();
        assert_eq!(
            read_file_within(dir.path(), "../../etc/passwd", LIMIT),
            FileRead::empty()
        );
    }

    #[test]
    fn returns_empty_for_a_directory() {
        let dir = tempdir().unwrap();
        assert_eq!(read_file_within(dir.path(), ".", LIMIT).content, "");
    }

    #[test]
    fn write_round_trips_and_overwrites_within_the_root() {
        let dir = tempdir().unwrap();
        write_file_within(dir.path(), "a.txt", "hello").unwrap();
        assert_eq!(
            read_file_within(dir.path(), "a.txt", LIMIT).content,
            "hello"
        );
        write_file_within(dir.path(), "a.txt", "bye").unwrap();
        assert_eq!(read_file_within(dir.path(), "a.txt", LIMIT).content, "bye");
    }

    #[test]
    fn trashing_refuses_the_root_a_workspace_folder_and_what_is_outside() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("api")).unwrap();
        let folders = vec!["api".to_string()];

        assert!(trash_within(dir.path(), "", &folders).is_err());
        assert!(trash_within(dir.path(), ".", &folders).is_err());
        assert!(trash_within(dir.path(), "api", &folders).is_err());
        assert!(trash_within(dir.path(), "api/", &folders).is_err());
        assert!(trash_within(dir.path(), "../elsewhere", &folders).is_err());
        assert!(trash_within(dir.path(), "missing.txt", &folders).is_err());
        assert!(dir.path().join("api").exists());
    }

    /// Moves a real file to this machine's Trash, so it only runs when asked for
    /// (`cargo test -- --ignored`).
    #[test]
    #[ignore = "puts a file in this machine's Trash"]
    fn a_file_goes_to_the_trash_and_leaves_the_folder() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("notes")).unwrap();
        fs::write(dir.path().join("notes/soromi-trash-test.txt"), "bye").unwrap();

        trash_within(dir.path(), "notes/soromi-trash-test.txt", &[]).unwrap();

        assert!(!dir.path().join("notes/soromi-trash-test.txt").exists());
        assert!(dir.path().join("notes").exists());
    }

    #[test]
    fn write_refuses_a_path_that_escapes_the_root() {
        let dir = tempdir().unwrap();
        assert!(write_file_within(dir.path(), "../escape.txt", "x").is_err());
    }
}
