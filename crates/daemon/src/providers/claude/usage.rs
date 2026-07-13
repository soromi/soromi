use std::path::Path;

use serde_json::Value;
use soromi_protocol::{AgentUsage, UsageWindow};

use crate::providers::{UsageAuth, UsageAuthState};

/// Claude's OAuth usage endpoint. Returns rolling-window utilization for the logged-in account.
const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";

/// The beta opt-in the OAuth endpoints require.
const OAUTH_BETA: &str = "oauth-2025-04-20";

/// The OAuth scope the usage endpoint requires. Logins made for inference only (e.g. long-lived
/// tokens) lack it, so we detect that up front rather than getting a 403 (often masked by a 429).
const USAGE_SCOPE: &str = "user:profile";

/// The response's rolling windows, paired with the short label shown in the UI.
const WINDOWS: &[(&str, &str)] = &[("five_hour", "5h"), ("seven_day", "7d")];

/// Resolves the account's usage credential. On macOS the token lives in the login Keychain (per
/// config dir), elsewhere in `<config>/.credentials.json`. Reports `MissingScope` when the token is
/// present but its scopes don't include the one usage needs, and `None` when not signed in.
pub(super) fn auth(config_dir: &Path) -> UsageAuthState {
    let Some(raw) = credential_json(config_dir) else {
        return UsageAuthState::None;
    };
    let Some(oauth) = serde_json::from_str::<Value>(&raw)
        .ok()
        .and_then(|value| value.get("claudeAiOauth").cloned())
    else {
        return UsageAuthState::None;
    };
    let Some(token) = oauth.get("accessToken").and_then(Value::as_str) else {
        return UsageAuthState::None;
    };

    if !has_usage_scope(&oauth) {
        return UsageAuthState::MissingScope;
    }

    let plan = oauth
        .get("subscriptionType")
        .and_then(Value::as_str)
        .map(str::to_string);

    UsageAuthState::Ready(UsageAuth {
        url: USAGE_URL,
        bearer: token.to_string(),
        headers: vec![("anthropic-beta", OAUTH_BETA.to_string())],
        plan,
    })
}

/// Whether the credential's `scopes` include the one the usage endpoint requires. A credential with
/// no `scopes` array is given the benefit of the doubt (older shape): let the request decide.
fn has_usage_scope(oauth: &Value) -> bool {
    match oauth.get("scopes").and_then(Value::as_array) {
        None => true,
        Some(scopes) => scopes.iter().any(|s| s.as_str() == Some(USAGE_SCOPE)),
    }
}

/// The raw credential JSON (`{ "claudeAiOauth": { ... } }`) for an account's config dir. macOS keeps
/// it in the Keychain; other platforms in a `.credentials.json` file. The Keychain read falls back
/// to the file too, in case a login wrote there.
fn credential_json(config_dir: &Path) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        keychain_credential(config_dir).or_else(|| file_credential(config_dir))
    }

    #[cfg(not(target_os = "macos"))]
    {
        file_credential(config_dir)
    }
}

/// Reads `<config>/.credentials.json`, the on-disk credential store (Linux and older setups).
fn file_credential(config_dir: &Path) -> Option<String> {
    std::fs::read_to_string(config_dir.join(".credentials.json")).ok()
}

/// Reads the credential JSON from the macOS login Keychain. Claude stores it under a service name
/// derived from the config dir, so isolated accounts each keep their own entry.
#[cfg(target_os = "macos")]
fn keychain_credential(config_dir: &Path) -> Option<String> {
    let service = keychain_service(config_dir);
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", &service, "-w"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8(output.stdout).ok()?;
    let trimmed = raw.trim();

    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// The Keychain service name for a config dir: the bare name for the default `~/.claude`, else it is
/// suffixed with the first 8 hex of the config dir path's SHA-256 (how Claude isolates accounts).
#[cfg(target_os = "macos")]
fn keychain_service(config_dir: &Path) -> String {
    const BASE: &str = "Claude Code-credentials";

    let is_default =
        dirs::home_dir().map(|home| home.join(".claude")) == Some(config_dir.to_path_buf());
    if is_default {
        return BASE.to_string();
    }

    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(config_dir.to_string_lossy().as_bytes());
    let suffix: String = digest
        .iter()
        .take(4)
        .map(|byte| format!("{byte:02x}"))
        .collect();

    format!("{BASE}-{suffix}")
}

/// Parses Claude's usage response. Each window carries `utilization` (already a 0-100 percent) and
/// `resets_at` (an ISO 8601 instant). Missing windows are skipped rather than failing the whole
/// parse, so a schema that gains or drops a window still shows what it can.
pub(super) fn parse(body: &[u8]) -> Option<AgentUsage> {
    let value: Value = serde_json::from_slice(body).ok()?;

    let windows = WINDOWS
        .iter()
        .filter_map(|(key, label)| {
            let window = value.get(key)?;
            let percent = window.get("utilization")?.as_f64()?;
            let resets_at = window
                .get("resets_at")
                .and_then(Value::as_str)
                .and_then(parse_iso);

            Some(UsageWindow {
                label: (*label).to_string(),
                percent,
                resets_at,
            })
        })
        .collect::<Vec<_>>();

    if windows.is_empty() {
        return None;
    }

    Some(AgentUsage {
        agent: "claude".to_string(),
        plan: None,
        windows,
        note: None,
    })
}

/// Parses an ISO 8601 / RFC 3339 instant into unix seconds.
fn parse_iso(text: &str) -> Option<f64> {
    chrono::DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|dt| dt.timestamp() as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_utilization_and_reset_windows() {
        let body = br#"{
            "five_hour": { "utilization": 42.5, "resets_at": "2026-07-12T18:00:00Z" },
            "seven_day": { "utilization": 10.0, "resets_at": "2026-07-19T00:00:00Z" }
        }"#;

        let usage = parse(body).unwrap();
        assert_eq!(usage.agent, "claude");
        assert_eq!(usage.windows.len(), 2);
        assert_eq!(usage.windows[0].label, "5h");
        assert_eq!(usage.windows[0].percent, 42.5);
        assert!(usage.windows[0].resets_at.unwrap() > 0.0);
    }

    #[test]
    fn returns_none_when_no_windows_present() {
        assert!(parse(br#"{ "other": 1 }"#).is_none());
    }

    #[test]
    fn usage_scope_is_required_when_scopes_are_listed() {
        // Full login: has the scope.
        let full = serde_json::json!({ "scopes": ["user:inference", "user:profile"] });
        assert!(has_usage_scope(&full));

        // Inference-only login (e.g. a long-lived token): lacks it.
        let inference = serde_json::json!({ "scopes": ["user:inference"] });
        assert!(!has_usage_scope(&inference));

        // No scopes array: give the benefit of the doubt (older credential shape).
        let legacy = serde_json::json!({ "accessToken": "x" });
        assert!(has_usage_scope(&legacy));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn keychain_service_hashes_the_config_dir() {
        use std::path::Path;

        // The suffix is the first 8 hex of SHA-256(config dir), matching Claude's Keychain naming.
        assert_eq!(
            keychain_service(Path::new("/Users/juand/.claude_mdlbeast")),
            "Claude Code-credentials-57ff731b"
        );
    }
}
