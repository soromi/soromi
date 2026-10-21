use std::process::{Child, Command};
use std::sync::{Arc, Mutex};

/// Holds the machine awake while engaged. Per-OS implementations sit behind this trait.
pub trait KeepAwake: Send + Sync {
    fn engage(&self);
    fn release(&self);
}

/// macOS: holds a `caffeinate` process while engaged.
#[derive(Default)]
pub struct CaffeinateKeepAwake {
    process: Mutex<Option<Child>>,
}

impl KeepAwake for CaffeinateKeepAwake {
    fn engage(&self) {
        let mut process = self.process.lock().unwrap();
        if process.is_some() {
            return;
        }
        // -i prevent idle system sleep, -m keep the disk awake, -s prevent system sleep on AC.
        // -w <pid> ties caffeinate to this process, so it exits (releasing the assertion) if we
        // are force-quit or crash without running cleanup. Normal release still kills it directly.
        if let Ok(child) = Command::new("/usr/bin/caffeinate")
            .args(["-i", "-m", "-s", "-w", &std::process::id().to_string()])
            .spawn()
        {
            *process = Some(child);
        }
    }

    fn release(&self) {
        if let Some(mut child) = self.process.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

/// Linux: holds a `systemd-inhibit` lock while engaged, which keeps the machine from going to sleep
/// on its own (the screen still sleeps). What it holds open is `tail --pid` of this process, so
/// the lock goes with the daemon if it is killed or crashes without releasing it.
pub struct InhibitKeepAwake {
    program: std::path::PathBuf,
    process: Mutex<Option<Child>>,
}

impl KeepAwake for InhibitKeepAwake {
    fn engage(&self) {
        let mut process = self.process.lock().unwrap();
        if process.is_some() {
            return;
        }
        let pid = std::process::id().to_string();
        if let Ok(child) = Command::new(&self.program)
            .args([
                "--what=idle:sleep",
                "--who=Soromi",
                "--why=An agent is working, or a device is connected",
                "--mode=block",
                "tail",
                "--pid",
                &pid,
                "-f",
                "/dev/null",
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            *process = Some(child);
        }
    }

    fn release(&self) {
        if let Some(mut child) = self.process.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// No-op for unsupported platforms and tests.
pub struct NoopKeepAwake;

impl KeepAwake for NoopKeepAwake {
    fn engage(&self) {}
    fn release(&self) {}
}

pub fn create_keep_awake() -> Arc<dyn KeepAwake> {
    if cfg!(target_os = "macos") {
        return Arc::new(CaffeinateKeepAwake::default());
    }
    // A Linux system without systemd has nothing to ask: the machine sleeps as it would.
    match crate::system::first_on_path(&["systemd-inhibit"]) {
        Some(program) if cfg!(target_os = "linux") => Arc::new(InhibitKeepAwake {
            program,
            process: Mutex::new(None),
        }),
        _ => Arc::new(NoopKeepAwake),
    }
}
