//! Update check. Polls the GitHub releases API for the latest tag and, when it is newer than
//! the running build, records it on the hub so viewports can show an "update available" banner.
//! Notify-only: the daemon never downloads or installs anything.

use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;

use crate::workspaces::service::WorkspaceService;

/// The public releases feed for the app. `latest` skips pre-releases and drafts.
const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/soromi/soromi/releases/latest";
/// Re-check interval. Releases are infrequent, so a slow poll is plenty.
const POLL_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

/// A newer release than the running build.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
    pub notes: Option<String>,
}

/// The subset of the GitHub release payload we read.
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    body: Option<String>,
}

/// The running build's version, the baseline every check compares against.
pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Spawns the background poller. Runs the first check immediately, then on `POLL_INTERVAL`.
pub fn spawn(hub: Arc<WorkspaceService>) {
    tokio::spawn(async move {
        loop {
            if let Some(info) = check(current_version()).await {
                hub.set_update(info);
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}

/// Fetches the latest release and returns it when its tag is newer than `current`.
pub async fn check(current: &str) -> Option<UpdateInfo> {
    // GitHub rejects requests without a User-Agent.
    let client = reqwest::Client::builder()
        .user_agent("soromi")
        .timeout(Duration::from_secs(15))
        .build()
        .ok()?;
    let response = client.get(LATEST_RELEASE_URL).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let release: Release = response.json().await.ok()?;
    if !is_newer(&release.tag_name, current) {
        return None;
    }
    Some(UpdateInfo {
        version: release.tag_name.trim_start_matches('v').to_string(),
        url: release.html_url,
        notes: release.body.filter(|body| !body.trim().is_empty()),
    })
}

/// True when `latest` is a strictly higher semver than `current`. Both may carry a `v` prefix.
/// Non-numeric or malformed parts compare as 0, so a garbled tag never reports an update.
fn is_newer(latest: &str, current: &str) -> bool {
    parts(latest) > parts(current)
}

/// The leading `MAJOR.MINOR.PATCH` as a comparable tuple. Anything past patch (pre-release or
/// build metadata) is ignored, so `1.2.0` and `1.2.0-rc1` compare equal.
fn parts(version: &str) -> (u32, u32, u32) {
    let core = version
        .trim()
        .trim_start_matches('v')
        .split(['-', '+'])
        .next()
        .unwrap_or_default();
    let mut nums = core.split('.').map(|n| n.parse::<u32>().unwrap_or(0));
    (
        nums.next().unwrap_or(0),
        nums.next().unwrap_or(0),
        nums.next().unwrap_or(0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_higher_versions() {
        assert!(is_newer("v0.2.0", "0.1.9"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(is_newer("v0.1.1", "0.1.0"));
    }

    #[test]
    fn ignores_same_or_older() {
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("v0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("0.1.0-rc1", "0.1.0"));
    }

    #[test]
    fn malformed_never_updates() {
        assert!(!is_newer("garbage", "0.1.0"));
        assert!(!is_newer("v", "0.0.1"));
    }
}
