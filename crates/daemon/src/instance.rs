//! The one daemon running on a Soromi home, and where it listens.
//!
//! A daemon holds an exclusive lock on `<home>/daemon.lock` for as long as it runs, and writes
//! `<home>/daemon.json` with its port. The lock is the operating system's, kept in memory: it goes
//! with the process however that ends (a crash, `kill -9`, the power going out), so it is what says
//! whether a daemon is running. `daemon.json` only says where; one left behind by a daemon that
//! died is read only while its lock is held, which it no longer is.
//!
//! The desktop app picks a free port for its daemon at each launch, so this is how the `soromi`
//! commands find it, and how a second daemon on the same home is kept from starting.

use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use soromi_protocol::Launcher;

use crate::home::soromi_home;

/// The exit code of a daemon that did not start because another runs on its home. The desktop app
/// reads it to use that one instead.
pub const ALREADY_RUNNING_EXIT: i32 = 3;

const LOCK_FILE: &str = "daemon.lock";
const INFO_FILE: &str = "daemon.json";

/// What a running daemon says about itself in `daemon.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstanceInfo {
    /// The loopback port its local link listens on.
    pub port: u16,
    pub pid: u32,
    pub version: String,
    pub launcher: Launcher,
    /// What a client presents to be let in on the local link (`transport::local`). Absent from a
    /// daemon too old to ask for one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// This process's claim to be the daemon of its home: the lock, held until it is dropped, when
/// `daemon.json` is taken away too.
pub struct Instance {
    /// `None` where no lock could be had (an unwritable home, a system without file locks).
    _lock: Option<File>,
    info: PathBuf,
}

/// Another daemon already runs on this home.
#[derive(Debug)]
pub struct AlreadyRunning(pub Option<InstanceInfo>);

impl Instance {
    /// Takes the lock for this process, or says which daemon holds it.
    pub fn claim() -> Result<Self, AlreadyRunning> {
        let home = soromi_home();
        let _ = fs::create_dir_all(&home);
        let info = home.join(INFO_FILE);
        // Nowhere to keep a lock, or no file locks on this system: there is no telling, so the
        // daemon runs, as it did before there was a lock.
        let Ok(lock) = open_lock() else {
            return Ok(Self { _lock: None, info });
        };
        match lock.try_lock() {
            Ok(()) => Ok(Self {
                _lock: Some(lock),
                info,
            }),
            Err(TryLockError::WouldBlock) => Err(AlreadyRunning(read_info())),
            Err(TryLockError::Error(_)) => Ok(Self { _lock: None, info }),
        }
    }

    /// Says where this daemon listens, for the `soromi` commands to find it.
    pub fn publish(&self, port: u16, launcher: Launcher, token: &str) {
        let info = InstanceInfo {
            port,
            pid: std::process::id(),
            version: crate::updates::current_version().to_string(),
            launcher,
            token: Some(token.to_string()),
        };
        let Ok(json) = serde_json::to_string_pretty(&info) else {
            return;
        };
        // Written aside and moved into place, so a reader never sees half of it.
        let partial = self.info.with_extension("json.partial");
        let written = owner_only(&partial).and_then(|mut file| file.write_all(json.as_bytes()));
        if written.is_ok() {
            let _ = fs::rename(&partial, &self.info);
        }
    }
}

impl Drop for Instance {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.info);
    }
}

/// The daemon running on this home, if one is: its lock is held, and it said where it listens.
pub fn running() -> Option<InstanceInfo> {
    let lock = open_lock().ok()?;
    match lock.try_lock() {
        // Nobody holds it, so nothing runs: whatever `daemon.json` says is left from one that died.
        Ok(()) => {
            let _ = lock.unlock();
            None
        }
        Err(TryLockError::WouldBlock) => read_info(),
        Err(TryLockError::Error(_)) => None,
    }
}

fn open_lock() -> std::io::Result<File> {
    OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(soromi_home().join(LOCK_FILE))
}

fn read_info() -> Option<InstanceInfo> {
    let raw = fs::read_to_string(soromi_home().join(INFO_FILE)).ok()?;
    serde_json::from_str(&raw).ok()
}

/// A file only this user can read: it says how to reach the daemon's trusted local link.
fn owner_only(path: &std::path::Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[serial_test::serial]
    fn one_daemon_holds_a_home_and_says_where_it_listens() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));

        assert!(running().is_none());
        let first = Instance::claim().unwrap();
        first.publish(53172, Launcher::Desktop, "secret");

        let found = running().unwrap();
        assert_eq!((found.port, found.launcher), (53172, Launcher::Desktop));
        // And the token its local link takes, in a note only this user can read.
        assert_eq!(found.token.as_deref(), Some("secret"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(home.path().join(INFO_FILE))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        // A second one on the same home is told who has it.
        let refused = Instance::claim().err().unwrap();
        assert_eq!(refused.0.map(|info| info.port), Some(53172));

        // Gone, it takes its note with it, and the home is free again. Not always at the very
        // instant: a process other tests start at that moment holds a copy of the lock's file
        // until it runs its program, which closes it.
        drop(first);
        assert!(running().is_none());
        assert!(!home.path().join(INFO_FILE).exists());
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while Instance::claim().is_err() {
            assert!(
                std::time::Instant::now() < deadline,
                "the home stayed taken"
            );
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        crate::home::set_soromi_home(None);
    }

    #[test]
    #[serial_test::serial]
    fn a_note_left_by_a_daemon_that_died_is_not_believed() {
        let home = tempfile::tempdir().unwrap();
        crate::home::set_soromi_home(Some(home.path().to_path_buf()));
        // What a daemon cut off by a power loss leaves: its note, and no lock held.
        let stale = InstanceInfo {
            port: 53172,
            pid: 999_999,
            version: "1.0.0".into(),
            launcher: Launcher::Desktop,
            token: None,
        };
        fs::write(
            home.path().join(INFO_FILE),
            serde_json::to_string(&stale).unwrap(),
        )
        .unwrap();

        assert!(running().is_none());
        assert!(Instance::claim().is_ok());

        crate::home::set_soromi_home(None);
    }
}
