use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use soromi_protocol::{Status, ToolApproval};
use tokio::sync::broadcast;

use super::notifier::{Notification, Notifier};
use super::push::{ExpoGateway, PushService};

pub const DEBOUNCE: Duration = Duration::from_millis(3500);
/// Every banner's title: the app's name.
const TITLE: &str = "Soromi";

/// A banner routed to a viewer that shows it itself (the Electron shell, a paired device) instead
/// of fired locally. Carries the `workspace` (and `session`, when known) it is about, so a click
/// can open that tab.
#[derive(Clone)]
pub struct WireNotification {
    pub title: String,
    pub body: String,
    pub workspace: String,
    pub session: Option<String>,
    /// The tool request it is about, when the session is waiting on one: its id, which a device
    /// answers from the banner itself (allow or deny).
    pub approval: Option<String>,
    /// Who it is for. A device is sent every banner over its link, and shows it or not by what is
    /// on its own screen; what is pushed to a phone that is put away is only what is for everyone.
    pub audience: Audience,
}

/// Who a banner is for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Audience {
    /// Nobody is looking at the app on this computer: it shows the banner, and so does every
    /// paired device (pushed to one that is put away).
    Everyone,
    /// Someone is looking at the app on this computer, where a banner adds nothing. A paired
    /// device whose app is open is still told: it may be in the hands of someone who is not at
    /// the computer, and only the device knows whether its own screen is being looked at. A phone
    /// that is put away is left alone: the person is at the computer.
    Devices,
    /// The person is on a paired device: it drives the sessions, or did when its app was put
    /// away and nobody at the computer has acted since. The computer stays quiet, whether or not
    /// its app is on screen; every device is told, and one that is put away is pushed it.
    Elsewhere,
}

/// Where a banner can go: this machine's notifier, the desktop shell, the paired devices.
#[derive(Clone)]
struct Outlets {
    notifier: Arc<dyn Notifier>,
    /// Native viewers on this computer (the Electron shell) subscribe here; while any are, its
    /// banners route to them as `Notify` wire messages instead of firing through `notifier` (so
    /// they carry the app identity).
    wire_tx: broadcast::Sender<WireNotification>,
    /// Paired devices that show banners subscribe here.
    device_tx: broadcast::Sender<WireNotification>,
    /// For the devices that are not there to be told over their link.
    push: Arc<PushService>,
}

impl Outlets {
    fn send(&self, banner: WireNotification) {
        // A send with nobody subscribed is an error that means just that.
        let _ = self.device_tx.send(banner.clone());
        if banner.audience == Audience::Devices {
            return;
        }
        self.push.deliver(&banner);
        if banner.audience == Audience::Elsewhere {
            return;
        }
        if self.wire_tx.receiver_count() > 0 {
            let _ = self.wire_tx.send(banner);
        } else {
            self.notifier.notify(Notification {
                title: banner.title,
                // Silent: the sound player owns the audio cue (immediate, per event), so the
                // banner does not double it up.
                message: banner.body,
                sound: false,
            });
        }
    }
}

fn is_attention(status: Status) -> bool {
    matches!(
        status,
        Status::WaitingInput | Status::Blocked | Status::Done
    )
}

struct SessionState {
    status: Status,
    fired: bool,
    pending: bool,
    /// Bumped whenever a pending timer should be invalidated (session left attention).
    generation: u64,
}

struct Inner {
    /// Attention state per session id.
    states: HashMap<String, SessionState>,
    /// Muted workspace names (mute is per workspace, so it silences all its sessions).
    muted: HashSet<String>,
}

/// Decides when to fire notifications from status transitions. Fires on entering an attention
/// state (waiting-input / blocked / done) after a debounce, at most once per episode (re-armed
/// when the session leaves the attention states). State is per session; mute is per workspace.
/// Timers run as tokio tasks, so it must be used within a runtime.
/// Finds the tool request a session is waiting on, if it is: what a banner about it asks.
pub type ApprovalLookup = Arc<dyn Fn(&str) -> Option<ToolApproval> + Send + Sync>;

pub struct NotificationController {
    outlets: Outlets,
    approvals: Arc<Mutex<Option<ApprovalLookup>>>,
    debounce: Duration,
    inner: Arc<Mutex<Inner>>,
}

impl NotificationController {
    pub fn new(notifier: Arc<dyn Notifier>) -> Self {
        Self::with_debounce(notifier, DEBOUNCE)
    }

    /// The controller as the daemon runs it: with the push tokens kept under the Soromi home.
    /// Every other constructor starts with none and keeps none, so nothing built for a test can
    /// reach a real phone.
    pub fn standard(notifier: Arc<dyn Notifier>) -> Self {
        Self::with_push(notifier, DEBOUNCE, Arc::new(PushService::standard()))
    }

    pub fn with_debounce(notifier: Arc<dyn Notifier>, debounce: Duration) -> Self {
        let push = PushService::new(Arc::new(ExpoGateway), None);
        Self::with_push(notifier, debounce, Arc::new(push))
    }

    pub fn with_push(
        notifier: Arc<dyn Notifier>,
        debounce: Duration,
        push: Arc<PushService>,
    ) -> Self {
        Self {
            outlets: Outlets {
                notifier,
                wire_tx: broadcast::channel(64).0,
                device_tx: broadcast::channel(64).0,
                push,
            },
            debounce,
            approvals: Arc::new(Mutex::new(None)),
            inner: Arc::new(Mutex::new(Inner {
                states: HashMap::new(),
                muted: HashSet::new(),
            })),
        }
    }

    /// How to find the tool request a session waits on, so the banner about it says what it asks
    /// and can be answered from (set by the workspace service, which knows the sessions).
    pub fn set_approvals(&self, lookup: ApprovalLookup) {
        *self.approvals.lock().unwrap() = Some(lookup);
    }

    /// Subscribes a native viewer on this computer: while it (or any) is subscribed, the
    /// computer's banners are delivered over this channel rather than fired locally.
    pub fn subscribe_wire(&self) -> broadcast::Receiver<WireNotification> {
        self.outlets.wire_tx.subscribe()
    }

    /// Subscribes a paired device, which gets every banner whoever is at the computer.
    pub fn subscribe_devices(&self) -> broadcast::Receiver<WireNotification> {
        self.outlets.device_tx.subscribe()
    }

    /// The devices that take pushed banners, for when they are not connected to be told.
    pub fn push(&self) -> Arc<PushService> {
        self.outlets.push.clone()
    }

    pub fn set_muted(&self, workspace: &str, muted: bool) {
        let mut inner = self.inner.lock().unwrap();
        if muted {
            inner.muted.insert(workspace.to_string());
        } else {
            inner.muted.remove(workspace);
        }
    }

    pub fn is_muted(&self, workspace: &str) -> bool {
        self.inner.lock().unwrap().muted.contains(workspace)
    }

    /// Fires a banner immediately for a discrete agent event (silent, since the sound player
    /// owns the audio), unless the workspace is muted. `session` (when known) rides along so a
    /// native click can open that tab. On this computer it routes to a native viewer if one is
    /// subscribed, else the OS; `audience` says whether the computer shows it at all.
    pub fn fire(&self, workspace: &str, session: Option<&str>, text: &str, audience: Audience) {
        self.fire_with(workspace, session, text, None, audience);
    }

    /// Fires the banner for a chat session that is waiting on the person. One waiting on a tool
    /// request says what it asks in place of `text`, and carries the request's id, so a device
    /// answers it from the banner itself (Allow or Deny).
    pub fn fire_waiting(&self, workspace: &str, session: &str, text: &str, audience: Audience) {
        let lookup = self.approvals.lock().unwrap().clone();
        let approval = lookup.and_then(|find| find(session));
        self.fire_with(workspace, Some(session), text, approval, audience);
    }

    fn fire_with(
        &self,
        workspace: &str,
        session: Option<&str>,
        text: &str,
        approval: Option<ToolApproval>,
        audience: Audience,
    ) {
        if self.is_muted(workspace) {
            return;
        }
        let body = match &approval {
            Some(approval) => format!("\"{workspace}\" {}", asks(approval)),
            None => format!("\"{workspace}\" {text}"),
        };
        self.outlets.send(WireNotification {
            title: TITLE.to_string(),
            body,
            workspace: workspace.to_string(),
            session: session.map(str::to_string),
            approval: approval.map(|approval| approval.id),
            audience,
        });
    }

    pub fn handle(&self, workspace: &str, session: &str, status: Status) {
        let mut inner = self.inner.lock().unwrap();
        let state = inner
            .states
            .entry(session.to_string())
            .or_insert(SessionState {
                status: Status::Idle,
                fired: false,
                pending: false,
                generation: 0,
            });
        state.status = status;

        if !is_attention(status) {
            state.generation += 1;
            state.pending = false;
            state.fired = false;
            return;
        }

        if state.fired || state.pending {
            return;
        }
        state.pending = true;
        let generation = state.generation;
        drop(inner);

        let inner = self.inner.clone();
        let outlets = self.outlets.clone();
        let approvals = self.approvals.clone();
        let debounce = self.debounce;
        let workspace = workspace.to_string();
        let session = session.to_string();
        tokio::spawn(async move {
            tokio::time::sleep(debounce).await;
            let (status, muted) = {
                let mut guard = inner.lock().unwrap();
                let Some(state) = guard.states.get_mut(&session) else {
                    return;
                };
                if state.generation != generation {
                    return;
                }
                state.pending = false;
                if !is_attention(state.status) {
                    return;
                }
                state.fired = true;
                (state.status, guard.muted.contains(&workspace))
            };
            if !muted {
                // Waiting on a tool request: the banner says what it asks, and can answer it.
                let lookup = approvals.lock().unwrap().clone();
                let approval = (status == Status::WaitingInput)
                    .then(|| lookup.and_then(|find| find(&session)))
                    .flatten();
                let body = match &approval {
                    Some(approval) => format!("\"{workspace}\" {}", asks(approval)),
                    None => format!("\"{workspace}\" {}", text_for(status)),
                };
                outlets.send(WireNotification {
                    title: TITLE.to_string(),
                    body,
                    workspace,
                    session: Some(session),
                    approval: approval.map(|approval| approval.id),
                    audience: Audience::Everyone,
                });
            }
        });
    }

    pub fn dispose(&self) {
        let mut inner = self.inner.lock().unwrap();
        for state in inner.states.values_mut() {
            state.generation += 1;
            state.pending = false;
        }
        inner.states.clear();
    }
}

/// What a tool request asks, for a banner: `asks to use Bash: pnpm test`.
fn asks(approval: &ToolApproval) -> String {
    const DETAIL: usize = 80;
    let detail = approval
        .path
        .as_deref()
        .or(approval.body.as_deref())
        .and_then(|text| text.lines().find(|line| !line.trim().is_empty()))
        .map(|line| {
            let line = line.trim();
            if line.chars().count() > DETAIL {
                format!("{}…", line.chars().take(DETAIL).collect::<String>())
            } else {
                line.to_string()
            }
        });
    match detail {
        Some(detail) => format!("asks to use {}: {detail}", approval.name),
        None => format!("asks to use {}", approval.name),
    }
}

fn text_for(status: Status) -> &'static str {
    match status {
        Status::WaitingInput => "needs your input",
        Status::Blocked => "is blocked",
        _ => "finished",
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn a_banner_about_a_tool_request_says_what_it_asks() {
        let approval = |path: Option<&str>, body: Option<&str>| ToolApproval {
            id: "r1".into(),
            name: "Bash".into(),
            path: path.map(str::to_string),
            body: body.map(str::to_string),
            kind: soromi_protocol::ToolKind::default(),
        };

        assert_eq!(
            asks(&approval(None, Some("\n  pnpm test\nmore"))),
            "asks to use Bash: pnpm test"
        );
        assert_eq!(
            asks(&approval(Some("src/a.ts"), Some("x"))),
            "asks to use Bash: src/a.ts"
        );
        assert_eq!(asks(&approval(None, None)), "asks to use Bash");
        let long = asks(&approval(None, Some(&"x".repeat(120))));
        assert!(long.ends_with('…') && long.chars().count() < 110);
    }

    use super::*;

    #[derive(Default)]
    struct Recording {
        messages: Mutex<Vec<String>>,
    }
    impl Notifier for Recording {
        fn notify(&self, notification: Notification) {
            self.messages.lock().unwrap().push(notification.message);
        }
    }

    #[tokio::test]
    async fn a_chat_session_waiting_on_a_tool_request_is_fired_with_it() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::with_debounce(rec.clone(), Duration::from_millis(20));
        ctrl.set_approvals(Arc::new(|session: &str| {
            (session == "s1").then(|| ToolApproval {
                id: "r1".into(),
                name: "Bash".into(),
                path: None,
                body: Some("pnpm test".into()),
                kind: soromi_protocol::ToolKind::default(),
            })
        }));
        let mut device = ctrl.subscribe_devices();

        ctrl.fire_waiting("kazomi", "s1", "needs your permission", Audience::Everyone);
        ctrl.fire_waiting("kazomi", "s2", "needs your permission", Audience::Devices);

        let asking = device.try_recv().expect("a banner");
        assert_eq!(asking.approval.as_deref(), Some("r1"));
        assert_eq!(asking.body, "\"kazomi\" asks to use Bash: pnpm test");
        assert_eq!(asking.session.as_deref(), Some("s1"));
        // Waiting on nothing the daemon holds: it says what it was given.
        let other = device.try_recv().expect("another");
        assert_eq!(other.approval, None);
        assert_eq!(other.body, "\"kazomi\" needs your permission");
        // The computer showed the one that was for everyone, saying what it asks.
        assert_eq!(
            *rec.messages.lock().unwrap(),
            vec!["\"kazomi\" asks to use Bash: pnpm test".to_string()]
        );
    }

    #[tokio::test]
    async fn fires_once_after_the_debounce() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::with_debounce(rec.clone(), Duration::from_millis(20));
        ctrl.handle("kazomi", "s1", Status::WaitingInput);
        ctrl.handle("kazomi", "s1", Status::WaitingInput); // still pending, no second timer
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert_eq!(rec.messages.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_session_waiting_on_a_tool_request_names_it_so_it_can_be_answered() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::with_debounce(rec.clone(), Duration::from_millis(20));
        ctrl.set_approvals(Arc::new(|session: &str| {
            (session == "s1").then(|| ToolApproval {
                id: "r1".into(),
                name: "Bash".into(),
                path: None,
                body: Some("pnpm test".into()),
                kind: soromi_protocol::ToolKind::default(),
            })
        }));
        let mut device = ctrl.subscribe_devices();

        ctrl.handle("kazomi", "s1", Status::WaitingInput);
        ctrl.handle("kazomi", "s2", Status::WaitingInput);
        tokio::time::sleep(Duration::from_millis(60)).await;

        let first = device.try_recv().expect("a banner");
        let second = device.try_recv().expect("another");
        let (asking, other) = if first.session.as_deref() == Some("s1") {
            (first, second)
        } else {
            (second, first)
        };
        assert_eq!(asking.approval.as_deref(), Some("r1"));
        assert_eq!(asking.body, "\"kazomi\" asks to use Bash: pnpm test");
        // One waiting on nothing in particular says so, as before.
        assert_eq!(other.approval, None);
        assert_eq!(other.body, "\"kazomi\" needs your input");
    }

    #[tokio::test]
    async fn leaving_attention_before_the_debounce_cancels() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::with_debounce(rec.clone(), Duration::from_millis(30));
        ctrl.handle("kazomi", "s1", Status::WaitingInput);
        ctrl.handle("kazomi", "s1", Status::Thinking);
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert!(rec.messages.lock().unwrap().is_empty());
    }

    #[test]
    fn a_device_is_told_even_with_someone_at_the_computer() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::new(rec.clone());
        let mut device = ctrl.subscribe_devices();

        ctrl.fire("kazomi", Some("s1"), "finished", Audience::Devices);

        let banner = device.try_recv().expect("the device's banner");
        assert_eq!(banner.body, "\"kazomi\" finished");
        assert_eq!(banner.session.as_deref(), Some("s1"));
        assert!(rec.messages.lock().unwrap().is_empty());
    }

    #[test]
    fn with_nobody_at_the_computer_it_shows_the_banner_and_so_does_a_device() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::new(rec.clone());
        let mut device = ctrl.subscribe_devices();

        ctrl.fire("kazomi", None, "finished", Audience::Everyone);

        assert!(device.try_recv().is_ok());
        assert_eq!(rec.messages.lock().unwrap().len(), 1);
    }

    #[test]
    fn a_device_does_not_take_the_banner_away_from_the_computer() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::new(rec.clone());
        let _device = ctrl.subscribe_devices();
        let mut shell = ctrl.subscribe_wire();

        ctrl.fire("kazomi", None, "finished", Audience::Everyone);
        // The shell shows it, in place of the OS notifier.
        assert!(shell.try_recv().is_ok());
        assert!(rec.messages.lock().unwrap().is_empty());

        // And nothing reaches it while the app is being looked at.
        ctrl.fire("kazomi", None, "finished", Audience::Devices);
        assert!(shell.try_recv().is_err());
    }

    /// Counts what it is asked to push.
    #[derive(Default)]
    struct Pushes(Mutex<usize>);
    impl super::super::push::PushGateway for Pushes {
        fn send(
            &self,
            _token: &str,
            _device: &str,
            _banner: &WireNotification,
        ) -> super::super::push::Sending {
            *self.0.lock().unwrap() += 1;
            Box::pin(async { super::super::push::Delivery::Sent })
        }
    }

    #[tokio::test]
    async fn with_the_person_on_a_device_the_computer_is_quiet_and_the_device_is_pushed() {
        let rec = Arc::new(Recording::default());
        let pushes = Arc::new(Pushes::default());
        let push = PushService::new(pushes.clone(), None);
        push.register("phone", Some("ExponentPushToken[abc]".into()));
        let ctrl = NotificationController::with_push(rec.clone(), DEBOUNCE, Arc::new(push));
        let mut device = ctrl.subscribe_devices();
        let mut shell = ctrl.subscribe_wire();

        ctrl.fire("kazomi", Some("s1"), "finished", Audience::Elsewhere);

        assert!(device.try_recv().is_ok());
        assert_eq!(*pushes.0.lock().unwrap(), 1);
        // Neither the shell nor the OS shows it on the computer.
        assert!(shell.try_recv().is_err());
        assert!(rec.messages.lock().unwrap().is_empty());

        // With the person at the computer instead, the phone in a pocket is left alone.
        ctrl.fire("kazomi", Some("s1"), "finished", Audience::Devices);
        assert_eq!(*pushes.0.lock().unwrap(), 1);
    }

    #[test]
    fn a_muted_workspace_tells_no_device() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::new(rec);
        let mut device = ctrl.subscribe_devices();
        ctrl.set_muted("kazomi", true);

        ctrl.fire("kazomi", None, "finished", Audience::Devices);

        assert!(device.try_recv().is_err());
    }

    #[tokio::test]
    async fn muted_workspace_does_not_fire() {
        let rec = Arc::new(Recording::default());
        let ctrl = NotificationController::with_debounce(rec.clone(), Duration::from_millis(20));
        ctrl.set_muted("kazomi", true);
        ctrl.handle("kazomi", "s1", Status::Done);
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert!(rec.messages.lock().unwrap().is_empty());
    }
}
