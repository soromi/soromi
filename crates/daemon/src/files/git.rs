//! Read-only git working-tree inspection for a workspace: the changed-file list and a per-file
//! unified diff. Shells out to the `git` binary (like the rest of the daemon shells out for
//! `security`/`osascript`/…); it never mutates the repo. Staging, commit, and friends live behind
//! the future write path — see `plans/git-tab-readonly.md`.

use std::path::{Component, Path, PathBuf};
use std::process::Command;

use soromi_protocol::{GitChange, GitStatusInfo};

/// A single diff won't stream more than this; a larger one is clipped and flagged `truncated`.
const MAX_DIFF: usize = 400 * 1024;
/// The most repositories offered for one workspace: past this the list is no longer a choice.
const MAX_REPOS: usize = 64;

/// The directory `folder` names under `root` ("" or "." = `root` itself), or `None` if it is not a
/// plain path down from it: absolute, or with a `..` in it.
pub fn inside(root: &Path, folder: &str) -> Option<PathBuf> {
    let mut dir = root.to_path_buf();
    for part in Path::new(folder).components() {
        match part {
            Component::Normal(name) => dir.push(name),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(dir)
}

/// Whether `dir` is in a git working tree: a repository's own folder, or one below it.
pub fn is_repo(dir: &Path) -> bool {
    toplevel(dir).is_some()
}

/// The top of the working tree `dir` is in.
fn toplevel(dir: &Path) -> Option<PathBuf> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let top = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!top.is_empty()).then(|| PathBuf::from(top))
}

/// The repositories of a workspace, as folders relative to `root` ("" = `root`), the root first and
/// the rest by name: the root if it is in a working tree, and every folder that is a repository
/// of its own among the ones the workspace is made of (`folders`) and the directories right under
/// the root. A folder that only sits inside the root's repository is part of that one.
pub fn repos(root: &Path, folders: &[String]) -> Vec<String> {
    let own = |dir: &Path| dir.join(".git").exists();
    let mut found: Vec<String> = folders
        .iter()
        .filter(|folder| !folder.is_empty() && folder.as_str() != ".")
        .filter(|folder| inside(root, folder).is_some_and(|dir| own(&dir)))
        .cloned()
        .collect();
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            if !name.starts_with('.') && own(&entry.path()) {
                found.push(name);
            }
        }
    }
    found.sort();
    found.dedup();
    found.truncate(MAX_REPOS);
    if is_repo(root) {
        found.insert(0, String::new());
    }
    found
}

/// The git working-tree status for `root`. Returns `is_repo: false` (not an error) when `root` isn't
/// a git repository, so the caller can render an empty state.
pub fn status(root: &Path) -> GitStatusInfo {
    let empty = GitStatusInfo {
        is_repo: false,
        branch: None,
        ahead: 0,
        behind: 0,
        changes: Vec::new(),
    };

    let output = match Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["status", "--porcelain=v1", "-z", "--branch"])
        .output()
    {
        Ok(output) if output.status.success() => output,
        // Non-zero (e.g. "not a git repository") or the binary is missing — treat as "no repo".
        _ => return empty,
    };

    parse_status(&String::from_utf8_lossy(&output.stdout))
}

/// The unified diff for one changed file. `staged` selects the index diff (`--cached`) over the
/// worktree diff. Untracked files have no diff against the index, so their whole content is shown as
/// an addition via `--no-index` against `/dev/null`. Returns `(patch, truncated)`.
pub fn diff(root: &Path, path: &str, staged: bool) -> (String, bool) {
    // A status lists paths from the top of the working tree, wherever in it it was asked for.
    let top = toplevel(root);
    let root = top.as_deref().unwrap_or(root);
    let mut command = Command::new("git");
    command.arg("-C").arg(root).arg("diff");
    if staged {
        command.arg("--cached");
    }
    let output = command.args(["--", path]).output();

    let mut patch = match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).into_owned(),
        Err(_) => String::new(),
    };

    // An untracked file produces no `git diff` output; show it as an all-additions diff instead.
    if patch.trim().is_empty()
        && !staged
        && let Ok(out) = Command::new("git")
            .arg("-C")
            .arg(root)
            .args(["diff", "--no-index", "--", "/dev/null", path])
            .output()
    {
        // `--no-index` exits non-zero when files differ, which is the normal case here.
        patch = String::from_utf8_lossy(&out.stdout).into_owned();
    }

    clip(patch)
}

/// Clips a diff to `MAX_DIFF` bytes (on a char boundary), returning whether it was clipped.
fn clip(mut patch: String) -> (String, bool) {
    if patch.len() <= MAX_DIFF {
        return (patch, false);
    }
    let mut end = MAX_DIFF;
    while !patch.is_char_boundary(end) {
        end -= 1;
    }
    patch.truncate(end);
    (patch, true)
}

/// Parses `git status --porcelain=v1 -z --branch` output. Records are NUL-separated; the first is the
/// `## <branch>...<upstream> [ahead N, behind M]` header, then one `XY <path>` per change (a rename
/// or copy is followed by a second NUL token holding the original path).
fn parse_status(raw: &str) -> GitStatusInfo {
    let mut branch = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut changes = Vec::new();

    let mut tokens = raw.split('\0').filter(|t| !t.is_empty()).peekable();
    while let Some(token) = tokens.next() {
        if let Some(header) = token.strip_prefix("## ") {
            let (b, a, be) = parse_branch_header(header);
            branch = b;
            ahead = a;
            behind = be;
            continue;
        }
        if token.len() < 3 {
            continue;
        }
        let bytes = token.as_bytes();
        let index = status_letter(bytes[0]);
        let worktree = status_letter(bytes[1]);
        let path = token[3..].to_string();
        // A rename/copy (index or worktree 'R'/'C') carries its source path in the next token.
        let orig_path =
            (bytes[0] == b'R' || bytes[0] == b'C' || bytes[1] == b'R' || bytes[1] == b'C')
                .then(|| tokens.next().map(str::to_string))
                .flatten();

        changes.push(GitChange {
            path,
            index,
            worktree,
            orig_path,
        });
    }

    GitStatusInfo {
        is_repo: true,
        branch,
        ahead,
        behind,
        changes,
    }
}

/// A porcelain status column: `' '` (unmodified) and `'?'`/`'!'` map to their own meaning — we keep
/// `?` (untracked) but treat `' '` as empty. `!` (ignored) isn't reported by default, so it's rare.
fn status_letter(byte: u8) -> String {
    match byte {
        b' ' => String::new(),
        other => (other as char).to_string(),
    }
}

/// Parses the `## main...origin/main [ahead 1, behind 2]` header into (branch, ahead, behind).
fn parse_branch_header(header: &str) -> (Option<String>, u32, u32) {
    let (name_part, track_part) = match header.split_once(' ') {
        Some((name, track)) => (name, Some(track)),
        None => (header, None),
    };
    // `branch...upstream` — keep the local branch name. A detached head reads "HEAD (no branch)".
    let branch = name_part
        .split("...")
        .next()
        .filter(|b| !b.is_empty())
        .map(str::to_string);

    let mut ahead = 0;
    let mut behind = 0;
    if let Some(track) = track_part {
        // e.g. "[ahead 1, behind 2]"
        for (key, value) in [("ahead ", &mut ahead), ("behind ", &mut behind)] {
            if let Some(rest) = track.split(key).nth(1) {
                let n: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                *value = n.parse().unwrap_or(0);
            }
        }
    }
    (branch, ahead, behind)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn git(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .expect("git runs");
        assert!(status.status.success(), "git {args:?}");
    }

    #[test]
    fn a_folder_is_a_plain_path_down_from_the_root() {
        let root = Path::new("/code/work");
        assert_eq!(inside(root, ""), Some(root.to_path_buf()));
        assert_eq!(inside(root, "."), Some(root.to_path_buf()));
        assert_eq!(inside(root, "apps/web"), Some(root.join("apps/web")));
        assert_eq!(inside(root, "../other"), None);
        assert_eq!(inside(root, "apps/../../other"), None);
        assert_eq!(inside(root, "/etc"), None);
    }

    #[test]
    fn a_folder_of_repositories_lists_each_and_not_itself() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        for name in ["web", "api", "notes", ".hidden"] {
            std::fs::create_dir(root.join(name)).unwrap();
        }
        git(&root.join("web"), &["init", "-q"]);
        git(&root.join("api"), &["init", "-q"]);
        git(&root.join(".hidden"), &["init", "-q"]);

        // The root is not a repository; `notes` is a plain folder.
        assert_eq!(repos(&root, &[".".to_string()]), vec!["api", "web"]);
        assert!(!status(&root).is_repo);
        assert!(status(&root.join("web")).is_repo);
    }

    #[test]
    fn a_repository_lists_itself_first_then_the_ones_inside_it() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        git(&root, &["init", "-q"]);
        std::fs::create_dir_all(root.join("packages/deep")).unwrap();
        std::fs::create_dir(root.join("vendor")).unwrap();
        git(&root.join("vendor"), &["init", "-q"]);
        git(&root.join("packages/deep"), &["init", "-q"]);

        // `packages` is only a folder of the root's repository. `packages/deep` is found because
        // the workspace names it, not by looking that far down.
        let folders = ["packages".to_string(), "packages/deep".to_string()];
        assert_eq!(repos(&root, &folders), vec!["", "packages/deep", "vendor"]);
    }

    #[test]
    fn a_diff_is_found_from_a_folder_below_the_top_of_its_repository() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        git(&root, &["init", "-q"]);
        std::fs::create_dir(root.join("app")).unwrap();
        std::fs::write(root.join("app/new.txt"), "hello\n").unwrap();
        git(&root, &["add", "app/new.txt"]);

        // The status asked for in `app` names the file from the top, and so does its diff.
        let listed = status(&root.join("app"));
        assert_eq!(listed.changes[0].path, "app/new.txt");
        let (patch, truncated) = diff(&root.join("app"), "app/new.txt", true);
        assert!(patch.contains("+hello"), "{patch}");
        assert!(!truncated);
    }

    #[test]
    fn parses_branch_header_with_ahead_behind() {
        let (branch, ahead, behind) = parse_branch_header("main...origin/main [ahead 1, behind 2]");
        assert_eq!(branch.as_deref(), Some("main"));
        assert_eq!((ahead, behind), (1, 2));
    }

    #[test]
    fn parses_branch_header_without_upstream() {
        let (branch, ahead, behind) = parse_branch_header("feature/x");
        assert_eq!(branch.as_deref(), Some("feature/x"));
        assert_eq!((ahead, behind), (0, 0));
    }

    #[test]
    fn parses_modified_staged_and_untracked() {
        // "## main", a staged-modify (M in index), an unstaged-modify (M in worktree), untracked.
        let raw = "## main\0 M src/a.rs\0M  src/b.rs\0?? new.txt\0";
        let status = parse_status(raw);
        assert!(status.is_repo);
        assert_eq!(status.branch.as_deref(), Some("main"));
        assert_eq!(status.changes.len(), 3);

        let a = &status.changes[0];
        assert_eq!(a.path, "src/a.rs");
        assert_eq!((a.index.as_str(), a.worktree.as_str()), ("", "M"));

        let b = &status.changes[1];
        assert_eq!((b.index.as_str(), b.worktree.as_str()), ("M", ""));

        let untracked = &status.changes[2];
        assert_eq!(
            (untracked.index.as_str(), untracked.worktree.as_str()),
            ("?", "?")
        );
    }

    #[test]
    fn parses_a_rename_with_its_source_path() {
        let raw = "## main\0R  new/name.rs\0old/name.rs\0";
        let status = parse_status(raw);
        assert_eq!(status.changes.len(), 1);
        let change = &status.changes[0];
        assert_eq!(change.index, "R");
        assert_eq!(change.path, "new/name.rs");
        assert_eq!(change.orig_path.as_deref(), Some("old/name.rs"));
    }

    #[test]
    fn clip_flags_a_large_diff() {
        let (short, truncated) = clip("small".to_string());
        assert!(!truncated);
        assert_eq!(short, "small");

        let big = "x".repeat(MAX_DIFF + 10);
        let (clipped, truncated) = clip(big);
        assert!(truncated);
        assert_eq!(clipped.len(), MAX_DIFF);
    }
}
