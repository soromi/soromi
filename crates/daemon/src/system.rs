//! What the daemon needs to know of the system it runs on, where that differs between them.

use std::path::{Path, PathBuf};

/// The first of `programs` that can be run from `PATH`, by its full path.
pub fn first_on_path(programs: &[&str]) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    programs.iter().find_map(|program| {
        std::env::split_paths(&path)
            .map(|dir| dir.join(program))
            .find(|candidate| is_executable(candidate))
    })
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_program_is_found_on_the_path_and_a_missing_one_is_not() {
        // Every system the daemon runs on has a shell.
        assert!(first_on_path(&["no-such-program-anywhere", "sh"]).is_some());
        assert!(first_on_path(&["no-such-program-anywhere"]).is_none());
    }
}
