//! Read-only git working-tree inspection for a workspace: the changed-file list and a per-file
//! unified diff. Shells out to the `git` binary (like the rest of the daemon shells out for
//! `security`/`osascript`/…); it never mutates the repo. Staging, commit, and friends live behind
//! the future write path — see `plans/git-tab-readonly.md`.

use std::path::Path;
use std::process::Command;

use soromi_protocol::{GitChange, GitStatusInfo};

/// A single diff won't stream more than this; a larger one is clipped and flagged `truncated`.
const MAX_DIFF: usize = 400 * 1024;

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
