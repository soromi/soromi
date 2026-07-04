use std::path::{Component, Path, PathBuf};

/// Resolves a workspace-relative path, or `None` if it escapes the workspace root. Resolution
/// is lexical (like Node's `path.resolve`): it never touches the filesystem, and `..` is
/// collapsed before the containment check.
pub fn resolve_within(root: &Path, path: &str) -> Option<PathBuf> {
    let root = normalize(root);
    let target = normalize(&join(&root, path));
    if target.starts_with(&root) {
        Some(target)
    } else {
        None
    }
}

fn join(root: &Path, path: &str) -> PathBuf {
    let p = Path::new(path);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        root.join(p)
    }
}

/// Collapses `.` and `..` components lexically.
fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_paths_under_the_root() {
        let root = Path::new("/work/space");
        assert_eq!(
            resolve_within(root, "api/x.ts"),
            Some(PathBuf::from("/work/space/api/x.ts"))
        );
        assert_eq!(
            resolve_within(root, "."),
            Some(PathBuf::from("/work/space"))
        );
    }

    #[test]
    fn rejects_escapes() {
        let root = Path::new("/work/space");
        assert_eq!(resolve_within(root, "../../etc/passwd"), None);
        assert_eq!(resolve_within(root, "/etc/passwd"), None);
    }

    #[test]
    fn does_not_treat_a_sibling_prefix_as_inside() {
        let root = Path::new("/work/space");
        assert_eq!(resolve_within(root, "../space-2/x"), None);
    }
}
