//! What the daemon needs to know of the system it runs on, where that differs between them.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use soromi_protocol::{HostInfo, Launcher};

/// What the daemon was told about itself, and is not for the programs it starts: a shell in a
/// Soromi terminal that started `soromi serve` would otherwise pass the app's `desktop` on to it.
pub const DAEMON_ONLY: [&str; 1] = ["SOROMI_LAUNCHER"];

/// This process's environment as the programs it starts (agents, shells) are given it.
pub fn child_env() -> Vec<(String, String)> {
    std::env::vars()
        .filter(|(key, _)| !DAEMON_ONLY.contains(&key.as_str()))
        .collect()
}

/// The computer this daemon runs on and what started it, worked out once.
pub fn host() -> &'static HostInfo {
    static HOST: OnceLock<HostInfo> = OnceLock::new();
    HOST.get_or_init(|| HostInfo {
        name: host_name(),
        os: os_name().to_string(),
        launcher: launcher_from(
            std::env::var("SOROMI_LAUNCHER").ok().as_deref(),
            std::env::var_os("INVOCATION_ID").is_some(),
        ),
    })
}

/// What started the daemon. The desktop app says so (`SOROMI_LAUNCHER=desktop`), as may a service
/// file; systemd marks every process it starts (`INVOCATION_ID`); anything else was a person at
/// a terminal.
fn launcher_from(said: Option<&str>, systemd: bool) -> Launcher {
    match said.map(str::trim) {
        Some("desktop") => Launcher::Desktop,
        Some("service") => Launcher::Service,
        Some("cli") => Launcher::Cli,
        _ if systemd => Launcher::Service,
        _ => Launcher::Cli,
    }
}

fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        _ => "linux",
    }
}

/// The computer's name as its owner knows it: the one set in a Mac's settings, the host name
/// elsewhere, without the `.local` a network adds.
fn host_name() -> String {
    let named = if cfg!(target_os = "macos") {
        output_of("scutil", &["--get", "ComputerName"])
    } else {
        std::fs::read_to_string("/proc/sys/kernel/hostname").ok()
    };
    let name = named
        .or_else(|| output_of("hostname", &[]))
        .map(|name| name.trim().trim_end_matches(".local").to_string())
        .unwrap_or_default();

    if name.is_empty() {
        "computer".to_string()
    } else {
        name
    }
}

fn output_of(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

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

    #[test]
    fn the_daemon_knows_what_started_it() {
        assert_eq!(launcher_from(Some("desktop"), false), Launcher::Desktop);
        // What was said wins over systemd: the app could itself run under a service manager.
        assert_eq!(launcher_from(Some("desktop"), true), Launcher::Desktop);
        assert_eq!(launcher_from(Some("service"), false), Launcher::Service);
        assert_eq!(launcher_from(None, true), Launcher::Service);
        assert_eq!(launcher_from(None, false), Launcher::Cli);
        assert_eq!(launcher_from(Some("something else"), false), Launcher::Cli);
    }

    #[test]
    fn the_computer_has_a_name() {
        assert!(!host().name.is_empty());
        assert!(!host().name.ends_with(".local"));
    }
}
