use std::cmp::Ordering;
use std::fs;
use std::path::Path;

use soromi_protocol::{DirEntry, EntryKind};

use super::paths::resolve_within;

/// Lists a directory within a workspace, read-only. An empty path lists the workspace's
/// declared folders as top-level nodes, except a single `.` folder (the whole work folder),
/// which lists the root's own contents. Any other path is read from disk, guarded against
/// escaping the workspace root. Directories sort before files, then alphabetically.
pub fn list_directory(root: &Path, folders: &[String], path: &str) -> Vec<DirEntry> {
    if path.is_empty() || path == "." {
        if folders.len() == 1 && folders[0] == "." {
            return read_entries(root);
        }
        // Skip declared folders that no longer exist on disk (e.g. deleted since the space
        // was created), so the tree never shows a phantom node.
        return folders
            .iter()
            .filter(|name| root.join(name).is_dir())
            .map(|name| DirEntry {
                name: name.clone(),
                kind: EntryKind::Dir,
            })
            .collect();
    }

    match resolve_within(root, path) {
        Some(target) => read_entries(&target),
        None => Vec::new(),
    }
}

fn read_entries(target: &Path) -> Vec<DirEntry> {
    let Ok(read_dir) = fs::read_dir(target) else {
        return Vec::new();
    };
    let mut entries: Vec<DirEntry> = read_dir
        .filter_map(|entry| entry.ok())
        .map(|entry| {
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            DirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                kind: if is_dir {
                    EntryKind::Dir
                } else {
                    EntryKind::File
                },
            }
        })
        .collect();
    entries.sort_by(by_dirs_then_name);
    entries
}

fn by_dirs_then_name(a: &DirEntry, b: &DirEntry) -> Ordering {
    match (a.kind, b.kind) {
        (EntryKind::Dir, EntryKind::File) => Ordering::Less,
        (EntryKind::File, EntryKind::Dir) => Ordering::Greater,
        _ => a.name.cmp(&b.name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::{tempdir, TempDir};

    fn setup() -> TempDir {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("api/src")).unwrap();
        fs::create_dir_all(dir.path().join("web")).unwrap();
        fs::write(dir.path().join("api/package.json"), "{}").unwrap();
        fs::write(dir.path().join("api/src/index.ts"), "").unwrap();
        dir
    }

    fn folder(name: &str) -> DirEntry {
        DirEntry {
            name: name.into(),
            kind: EntryKind::Dir,
        }
    }

    fn file(name: &str) -> DirEntry {
        DirEntry {
            name: name.into(),
            kind: EntryKind::File,
        }
    }

    #[test]
    fn lists_the_folders_at_the_root() {
        let dir = setup();
        assert_eq!(
            list_directory(dir.path(), &["api".into(), "web".into()], ""),
            vec![folder("api"), folder("web")]
        );
    }

    #[test]
    fn filters_out_declared_folders_that_no_longer_exist() {
        let dir = setup();
        assert_eq!(
            list_directory(dir.path(), &["api".into(), "gone".into()], ""),
            vec![folder("api")]
        );
    }

    #[test]
    fn lists_the_root_contents_when_the_only_folder_is_dot() {
        let dir = setup();
        // The `.` space lists the root's own contents (both real folders here).
        assert_eq!(
            list_directory(dir.path(), &[".".into()], ""),
            vec![folder("api"), folder("web")]
        );
    }

    #[test]
    fn reads_a_directory_dirs_before_files() {
        let dir = setup();
        assert_eq!(
            list_directory(dir.path(), &["api".into()], "api"),
            vec![folder("src"), file("package.json")]
        );
    }

    #[test]
    fn returns_nothing_for_a_path_that_escapes_the_root() {
        let dir = setup();
        assert_eq!(
            list_directory(dir.path(), &["api".into()], "../.."),
            Vec::<DirEntry>::new()
        );
    }

    #[test]
    fn returns_nothing_for_a_missing_directory() {
        let dir = setup();
        assert_eq!(
            list_directory(dir.path(), &["api".into()], "api/nope"),
            Vec::<DirEntry>::new()
        );
    }
}
