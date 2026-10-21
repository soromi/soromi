//! The computer's folders, outside any workspace, for picking a new workspace's folders from a
//! device that has no file dialog of the computer's own (the phone). Folders only: a workspace is
//! made of folders. A paired device can already run a shell here, so this shows it nothing it
//! could not see otherwise.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// One folder of the computer, as a picker shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Browse {
    /// Where it is, absolute.
    pub path: String,
    /// The folder it is in; `None` at the top of the filesystem.
    pub parent: Option<String>,
    /// The user's home folder, where a picker starts.
    pub home: String,
    /// The folders in it, by name, sorted, without hidden ones.
    pub dirs: Vec<String>,
    /// Whether it holds a `soromi.space.json`, which can be imported as it describes.
    pub space_file: bool,
}

/// The folder at `path` (`~` and `~/…` are the home folder), or the home folder when no path is
/// given.
pub fn browse(path: Option<&str>) -> io::Result<Browse> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    // As the folders listed are, links and all resolved, so the two compare.
    let home = fs::canonicalize(&home).unwrap_or(home);
    let wanted = match path.map(str::trim).filter(|path| !path.is_empty()) {
        None | Some("~") => home.clone(),
        Some(path) => match path.strip_prefix("~/") {
            Some(rest) => home.join(rest),
            None => PathBuf::from(path),
        },
    };
    if !wanted.is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "a folder is named by its full path",
        ));
    }
    let folder = fs::canonicalize(&wanted)?;
    if !folder.is_dir() {
        return Err(io::Error::new(io::ErrorKind::NotADirectory, "not a folder"));
    }

    let mut dirs: Vec<String> = fs::read_dir(&folder)?
        .flatten()
        .filter(|entry| is_dir(&entry.path()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| !name.starts_with('.'))
        .collect();
    dirs.sort_by_key(|name| name.to_lowercase());

    Ok(Browse {
        path: text(&folder),
        parent: folder.parent().map(text),
        home: text(&home),
        dirs,
        space_file: folder.join("soromi.space.json").is_file(),
    })
}

/// A folder, or a link to one.
fn is_dir(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|meta| meta.is_dir())
}

fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_lists_its_folders_and_says_if_it_can_be_imported() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["web", "Api", ".git"] {
            fs::create_dir(dir.path().join(name)).unwrap();
        }
        fs::write(dir.path().join("README.md"), "hi").unwrap();
        fs::write(dir.path().join("soromi.space.json"), "{}").unwrap();

        let listed = browse(Some(&text(dir.path()))).unwrap();

        assert_eq!(listed.dirs, ["Api", "web"]);
        assert!(listed.space_file);
        assert_eq!(listed.path, text(&fs::canonicalize(dir.path()).unwrap()));
        assert!(listed.parent.is_some());
    }

    #[test]
    fn no_path_is_the_home_folder_and_a_relative_one_is_refused() {
        let home = browse(None).unwrap();
        assert_eq!(home.path, home.home.trim_end_matches('/'));
        assert!(browse(Some("code/app")).is_err());
        assert!(browse(Some("/no/such/folder/anywhere")).is_err());
    }
}
