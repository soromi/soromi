use std::path::Path;

use serde_json::Value;
use soromi_protocol::{AgentUsage, UsageWindow};

use crate::providers::{UsageAuth, UsageAuthState};

/// Codex's usage endpoint (the ChatGPT backend, since Codex rides the ChatGPT plan).
const USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";

/// The rate-limit windows in the response, in display order.
const WINDOWS: &[&str] = &["primary_window", "secondary_window"];

/// Resolves the usage credential from `auth.json`: the bearer token plus the account id header the
/// endpoint requires. `None` if either is missing (not signed in).
pub(super) fn auth(config_dir: &Path) -> UsageAuthState {
    let Some(raw) = std::fs::read_to_string(config_dir.join("auth.json")).ok() else {
        return UsageAuthState::None;
    };
    let Some(tokens) = serde_json::from_str::<Value>(&raw)
        .ok()
        .and_then(|value| value.get("tokens").cloned())
    else {
        return UsageAuthState::None;
    };
    let (Some(token), Some(account_id)) = (
        tokens.get("access_token").and_then(Value::as_str),
        tokens.get("account_id").and_then(Value::as_str),
    ) else {
        return UsageAuthState::None;
    };

    UsageAuthState::Ready(UsageAuth {
        url: USAGE_URL,
        bearer: token.to_string(),
        headers: vec![("ChatGPT-Account-Id", account_id.to_string())],
        // Codex reports the plan in the usage response, not the credential.
        plan: None,
    })
}

/// Parses Codex's usage response. Windows live under `rate_limit`; each carries `used_percent` (an
/// integer percent), `reset_at` (unix seconds), and `limit_window_seconds` (used to label the
/// window, e.g. 5h / 7d). The plan tier comes from `plan_type`.
pub(super) fn parse(body: &[u8]) -> Option<AgentUsage> {
    let value: Value = serde_json::from_slice(body).ok()?;
    let rate_limit = value.get("rate_limit")?;

    let windows = WINDOWS
        .iter()
        .filter_map(|key| {
            let window = rate_limit.get(key)?;
            let percent = window.get("used_percent")?.as_f64()?;
            let resets_at = window.get("reset_at").and_then(Value::as_f64);
            let label = window
                .get("limit_window_seconds")
                .and_then(Value::as_u64)
                .map(window_label)
                .unwrap_or_else(|| (*key).to_string());

            Some(UsageWindow {
                label,
                percent,
                resets_at,
            })
        })
        .collect::<Vec<_>>();

    if windows.is_empty() {
        return None;
    }

    let plan = value
        .get("plan_type")
        .and_then(Value::as_str)
        .map(str::to_string);

    Some(AgentUsage {
        agent: "codex".to_string(),
        plan,
        windows,
        note: None,
    })
}

/// A short human label for a window length in seconds (e.g. 18000 -> "5h", 604800 -> "7d").
fn window_label(seconds: u64) -> String {
    if seconds.is_multiple_of(86_400) {
        format!("{}d", seconds / 86_400)
    } else if seconds.is_multiple_of(3_600) {
        format!("{}h", seconds / 3_600)
    } else {
        format!("{}m", seconds / 60)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_windows_plan_and_labels() {
        let body = br#"{
            "plan_type": "plus",
            "rate_limit": {
                "primary_window": { "used_percent": 30, "reset_at": 1760000000, "limit_window_seconds": 18000 },
                "secondary_window": { "used_percent": 5, "reset_at": 1760500000, "limit_window_seconds": 604800 }
            }
        }"#;

        let usage = parse(body).unwrap();
        assert_eq!(usage.agent, "codex");
        assert_eq!(usage.plan.as_deref(), Some("plus"));
        assert_eq!(usage.windows.len(), 2);
        assert_eq!(usage.windows[0].label, "5h");
        assert_eq!(usage.windows[0].percent, 30.0);
        assert_eq!(usage.windows[1].label, "7d");
        assert_eq!(usage.windows[0].resets_at, Some(1760000000.0));
    }

    #[test]
    fn returns_none_without_rate_limit() {
        assert!(parse(br#"{ "plan_type": "plus" }"#).is_none());
    }
}
