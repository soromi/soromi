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
        if let Ok(child) = Command::new("/usr/bin/caffeinate")
            .args(["-i", "-m", "-s"])
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

/// No-op for unsupported platforms and tests.
pub struct NoopKeepAwake;

impl KeepAwake for NoopKeepAwake {
    fn engage(&self) {}
    fn release(&self) {}
}

pub fn create_keep_awake() -> Arc<dyn KeepAwake> {
    if cfg!(target_os = "macos") {
        Arc::new(CaffeinateKeepAwake::default())
    } else {
        Arc::new(NoopKeepAwake)
    }
}
