use std::process::{Command, Stdio};
use std::sync::Arc;

/// A single OS notification request.
pub struct Notification {
    pub title: String,
    pub message: String,
    pub sound: bool,
}

/// Fires an OS-native notification. Per-OS implementations sit behind this trait.
pub trait Notifier: Send + Sync {
    fn notify(&self, notification: Notification);
}

/// macOS notifications via `osascript`. Fire-and-forget; never crashes the daemon.
pub struct MacNotifier;

impl Notifier for MacNotifier {
    fn notify(&self, notification: Notification) {
        let sound = if notification.sound {
            " sound name \"Ping\""
        } else {
            ""
        };
        let script = format!(
            "display notification {} with title {}{sound}",
            quote(&notification.message),
            quote(&notification.title),
        );
        let _ = Command::new("osascript")
            .args(["-e", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}

/// No-op notifier for unsupported platforms and tests.
pub struct NoopNotifier;

impl Notifier for NoopNotifier {
    fn notify(&self, _notification: Notification) {}
}

pub fn create_notifier() -> Arc<dyn Notifier> {
    if cfg!(target_os = "macos") {
        Arc::new(MacNotifier)
    } else {
        Arc::new(NoopNotifier)
    }
}

fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}
