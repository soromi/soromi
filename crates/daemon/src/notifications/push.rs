//! Banners for a phone whose app is not there to show them: closed, or behind another app. They go
//! through a push service, which hands them to Apple or Google, which wake the phone.
//!
//! A phone that wants them gives the daemon a token (`RegisterPush`); the daemon keeps it with the
//! device's id. A banner is pushed to every device that has a token and is not watching: a device
//! whose app is on screen and connected is sent the banner over its link instead, and shows it
//! itself. So each banner reaches a phone one way, never both.
//!
//! What leaves this machine is the banner as the desktop shows it (the workspace's name and what
//! happened, "finished") and the session's id. It is not end-to-end encrypted the way the link is:
//! the push service, and Apple or Google after it, can read it.

use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};

use super::controller::WireNotification;

const EXPO_PUSH_URL: &str = "https://exp.host/--/api/v2/push/send";
const TOKENS_FILE: &str = "push.json";
/// The Android channel the phone app posts its banners on, so a pushed one looks the same.
const CHANNEL: &str = "sessions";
/// The kind of banner the app shows Allow and Deny buttons under (registered by the app).
const APPROVAL_CATEGORY: &str = "approval";
const SEND_LIMIT: Duration = Duration::from_secs(15);
/// Longer than any token the push service hands out; anything past it is not one.
const MAX_TOKEN: usize = 256;

/// What became of a banner handed to the push service.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    Sent,
    /// The token is no longer a phone's: the app was removed, or its notifications turned off.
    Gone,
    /// Not sent this time (no network, the service refused). The banner is not tried again: by
    /// the time it could be, it is old news.
    Failed,
}

pub type Sending = Pin<Box<dyn Future<Output = Delivery> + Send>>;

/// Hands a banner to a push service for one phone. `device` is that phone's id here, which goes
/// along so a phone paired with several computers can tell which one a banner came from.
pub trait PushGateway: Send + Sync {
    fn send(&self, token: &str, device: &str, banner: &WireNotification) -> Sending;
}

/// Expo's push service, which takes one kind of token for both Apple's and Google's.
pub struct ExpoGateway;

impl PushGateway for ExpoGateway {
    fn send(&self, token: &str, device: &str, banner: &WireNotification) -> Sending {
        let mut message = json!({
            "to": token,
            "title": banner.title,
            "body": banner.body,
            "data": {
                "workspace": banner.workspace,
                "session": banner.session,
                "device": device,
                "approval": banner.approval,
            },
            "sound": "default",
            "channelId": CHANNEL,
            "priority": "high",
        });
        // A tool request is answered from the banner: the app shows Allow and Deny under it.
        if banner.approval.is_some() {
            message["categoryId"] = json!(APPROVAL_CATEGORY);
        }
        Box::pin(async move {
            let Ok(client) = reqwest::Client::builder().timeout(SEND_LIMIT).build() else {
                return Delivery::Failed;
            };
            let Ok(response) = client.post(EXPO_PUSH_URL).json(&message).send().await else {
                return Delivery::Failed;
            };
            match response.json::<Value>().await {
                Ok(answer) => delivery_from(&answer),
                Err(_) => Delivery::Failed,
            }
        })
    }
}

/// Reads the service's answer to one message: a ticket, alone or in a list of one. A refusal is
/// said on stderr: one that is the app's (no push credentials for it) fails every banner, and
/// would otherwise go unseen.
fn delivery_from(answer: &Value) -> Delivery {
    let ticket = match &answer["data"] {
        Value::Array(tickets) => tickets.first().unwrap_or(&Value::Null),
        ticket => ticket,
    };
    match ticket["status"].as_str() {
        Some("ok") => Delivery::Sent,
        Some("error") if ticket["details"]["error"] == "DeviceNotRegistered" => Delivery::Gone,
        _ => {
            let reason = ticket["message"]
                .as_str()
                .or(answer["errors"][0]["message"].as_str())
                .unwrap_or("no answer the daemon understood");
            eprintln!("soromi: a banner could not be pushed to a phone: {reason}");
            Delivery::Failed
        }
    }
}

/// Whether a string is a token of the push service's, and not something else a client sent.
fn is_token(token: &str) -> bool {
    let named = token.starts_with("ExponentPushToken[") || token.starts_with("ExpoPushToken[");
    named && token.ends_with(']') && token.len() <= MAX_TOKEN
}

#[derive(Default)]
struct Inner {
    /// Each device's token, by device id.
    tokens: HashMap<String, String>,
    /// The links through which a device's app is on screen and being sent banners, by device id.
    watching: HashMap<String, HashSet<u64>>,
}

/// Which paired devices take pushed banners, and the sending of them.
pub struct PushService {
    gateway: Arc<dyn PushGateway>,
    /// Where the tokens are kept between runs; `None` keeps them in memory only.
    store: Option<PathBuf>,
    inner: Arc<Mutex<Inner>>,
}

impl PushService {
    pub fn new(gateway: Arc<dyn PushGateway>, store: Option<PathBuf>) -> Self {
        let tokens = store
            .as_ref()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self {
            gateway,
            store,
            inner: Arc::new(Mutex::new(Inner {
                tokens,
                watching: HashMap::new(),
            })),
        }
    }

    /// The service as the daemon runs it: Expo's, with the tokens kept under the Soromi home.
    pub fn standard() -> Self {
        let store = crate::home::soromi_home().join(TOKENS_FILE);
        Self::new(Arc::new(ExpoGateway), Some(store))
    }

    /// Keeps a device's token, or forgets it (`None`: the phone stopped wanting pushed banners).
    /// Anything that is not a token is taken as none.
    pub fn register(&self, device: &str, token: Option<String>) {
        let mut inner = self.inner.lock().unwrap();
        let token = token.filter(|token| is_token(token));
        let changed = match token {
            Some(token) => inner.tokens.insert(device.to_string(), token.clone()) != Some(token),
            None => inner.tokens.remove(device).is_some(),
        };
        if changed {
            save(&self.store, &inner.tokens);
        }
    }

    /// The device was revoked: nothing is sent to it again.
    pub fn forget(&self, device: &str) {
        self.register(device, None);
        self.inner.lock().unwrap().watching.remove(device);
    }

    /// Whether banners can be pushed to a device. One without a token only has its link.
    pub fn has_token(&self, device: &str) -> bool {
        self.inner.lock().unwrap().tokens.contains_key(device)
    }

    /// Records whether a device's app is on screen and taking banners through the link `viewer`.
    pub fn set_watching(&self, device: &str, viewer: u64, watching: bool) {
        let mut inner = self.inner.lock().unwrap();
        if watching {
            inner
                .watching
                .entry(device.to_string())
                .or_default()
                .insert(viewer);
        } else if let Some(viewers) = inner.watching.get_mut(device) {
            viewers.remove(&viewer);
            if viewers.is_empty() {
                inner.watching.remove(device);
            }
        }
    }

    /// Pushes a banner to every device that has a token and is not watching. Returns at once; the
    /// sending happens on the runtime. A token the service says is gone is forgotten.
    pub fn deliver(&self, banner: &WireNotification) {
        let targets: Vec<(String, String)> = {
            let inner = self.inner.lock().unwrap();
            inner
                .tokens
                .iter()
                .filter(|(device, _)| !inner.watching.contains_key(*device))
                .map(|(device, token)| (device.clone(), token.clone()))
                .collect()
        };
        for (device, token) in targets {
            let sending = self.gateway.send(&token, &device, banner);
            let inner = self.inner.clone();
            let store = self.store.clone();
            tokio::spawn(async move {
                if sending.await != Delivery::Gone {
                    return;
                }
                let mut inner = inner.lock().unwrap();
                // Only if it is still the token that was refused: the phone may have sent a new one.
                if inner.tokens.get(&device) == Some(&token) {
                    inner.tokens.remove(&device);
                    save(&store, &inner.tokens);
                }
            });
        }
    }
}

/// Writes the tokens where they are kept, best-effort: a token that is lost is sent again by the
/// phone the next time it connects.
fn save(store: &Option<PathBuf>, tokens: &HashMap<String, String>) {
    let Some(path) = store else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(tokens) {
        let _ = std::fs::write(path, text);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::controller::Audience;

    const TOKEN: &str = "ExponentPushToken[abc123]";

    /// Records what it is asked to send, and answers each with the same outcome.
    struct Recording {
        sent: Mutex<Vec<(String, String)>>,
        outcome: Delivery,
    }

    impl Recording {
        fn answering(outcome: Delivery) -> Arc<Self> {
            Arc::new(Self {
                sent: Mutex::new(Vec::new()),
                outcome,
            })
        }

        fn sent(&self) -> Vec<(String, String)> {
            self.sent.lock().unwrap().clone()
        }
    }

    impl PushGateway for Recording {
        fn send(&self, token: &str, _device: &str, banner: &WireNotification) -> Sending {
            self.sent
                .lock()
                .unwrap()
                .push((token.to_string(), banner.body.clone()));
            let outcome = self.outcome;
            Box::pin(async move { outcome })
        }
    }

    fn banner() -> WireNotification {
        WireNotification {
            title: "Soromi".into(),
            body: "\"kazomi\" finished".into(),
            workspace: "kazomi".into(),
            session: Some("s1".into()),
            approval: None,
            audience: Audience::Everyone,
        }
    }

    #[tokio::test]
    async fn a_device_with_a_token_is_pushed_the_banner() {
        let gateway = Recording::answering(Delivery::Sent);
        let push = PushService::new(gateway.clone(), None);
        push.register("phone", Some(TOKEN.into()));

        push.deliver(&banner());

        assert_eq!(
            gateway.sent(),
            vec![(TOKEN.to_string(), "\"kazomi\" finished".to_string())]
        );
    }

    #[tokio::test]
    async fn a_device_that_is_watching_is_not_pushed_what_its_link_brings() {
        let gateway = Recording::answering(Delivery::Sent);
        let push = PushService::new(gateway.clone(), None);
        push.register("phone", Some(TOKEN.into()));

        // Two links for a moment, as when it changes route; it watches until both have stopped.
        push.set_watching("phone", 1, true);
        push.set_watching("phone", 2, true);
        push.set_watching("phone", 1, false);
        push.deliver(&banner());
        assert!(gateway.sent().is_empty());

        push.set_watching("phone", 2, false);
        push.deliver(&banner());
        assert_eq!(gateway.sent().len(), 1);
    }

    #[tokio::test]
    async fn a_token_the_service_says_is_gone_is_forgotten() {
        let gateway = Recording::answering(Delivery::Gone);
        let push = PushService::new(gateway.clone(), None);
        push.register("phone", Some(TOKEN.into()));

        push.deliver(&banner());
        tokio::task::yield_now().await;

        assert!(!push.has_token("phone"));
    }

    #[tokio::test]
    async fn nothing_is_pushed_without_a_token_or_once_it_is_taken_back() {
        let gateway = Recording::answering(Delivery::Sent);
        let push = PushService::new(gateway.clone(), None);

        // Not a token: whatever a client sends in its place counts as none.
        push.register("phone", Some("https://example.com/collect".into()));
        push.deliver(&banner());
        assert!(!push.has_token("phone"));

        push.register("phone", Some(TOKEN.into()));
        push.register("phone", None);
        push.deliver(&banner());
        push.register("phone", Some(TOKEN.into()));
        push.forget("phone");
        push.deliver(&banner());

        assert!(gateway.sent().is_empty());
    }

    #[test]
    fn tokens_are_kept_between_runs() {
        let home = tempfile::tempdir().unwrap();
        let store = home.path().join("push.json");
        let gateway = Recording::answering(Delivery::Sent);

        let push = PushService::new(gateway.clone(), Some(store.clone()));
        push.register("phone", Some(TOKEN.into()));

        let again = PushService::new(gateway, Some(store));
        assert!(again.has_token("phone"));
    }

    #[test]
    fn the_services_answer_is_read_for_what_became_of_the_banner() {
        let ok = json!({ "data": { "status": "ok", "id": "x" } });
        assert_eq!(delivery_from(&ok), Delivery::Sent);
        let listed = json!({ "data": [{ "status": "ok", "id": "x" }] });
        assert_eq!(delivery_from(&listed), Delivery::Sent);

        let gone = json!({
            "data": { "status": "error", "details": { "error": "DeviceNotRegistered" } }
        });
        assert_eq!(delivery_from(&gone), Delivery::Gone);

        let refused = json!({
            "data": { "status": "error", "details": { "error": "MessageRateExceeded" } }
        });
        assert_eq!(delivery_from(&refused), Delivery::Failed);
        assert_eq!(delivery_from(&json!({ "errors": [] })), Delivery::Failed);
    }
}
