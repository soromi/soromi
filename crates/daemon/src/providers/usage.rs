use std::path::Path;

use soromi_protocol::AgentUsage;

use super::{Provider, UsageAuthState};

/// The result of trying to read one provider's usage for an account.
pub enum UsageOutcome {
    /// Usage was fetched and parsed.
    Usage(AgentUsage),
    /// The account is signed in, but the endpoint refused the token (401/403), typically because
    /// the login lacks the scope usage requires. The user should re-login.
    Forbidden,
    /// The account is signed in, but usage could not be read right now (rate limit, server error,
    /// network, or an unparseable body). Worth surfacing, but retried sooner than a stable result.
    Temporary,
    /// Nothing to show: no usage endpoint, or the account is not signed in.
    NotSignedIn,
}

/// Fetches one provider's plan usage for an account config dir. Distinguishes a signed-in account
/// that can't read usage (`Forbidden` / `Temporary`, both surfaced to the user) from one with no
/// login at all (`NotSignedIn`, omitted).
pub async fn fetch(
    provider: &dyn Provider,
    config_dir: &Path,
    client: &reqwest::Client,
) -> UsageOutcome {
    let auth = match provider.usage_auth(config_dir) {
        UsageAuthState::Ready(auth) => auth,
        // Known from the credential: skip the doomed call and tell the user to re-login.
        UsageAuthState::MissingScope => return UsageOutcome::Forbidden,
        UsageAuthState::None => return UsageOutcome::NotSignedIn,
    };

    let mut request = client.get(auth.url).bearer_auth(&auth.bearer);
    for (name, value) in &auth.headers {
        request = request.header(*name, value);
    }

    let Ok(response) = request.send().await else {
        return UsageOutcome::Temporary;
    };
    let status = response.status();

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return UsageOutcome::Forbidden;
    }
    if !status.is_success() {
        // Rate limit (429), server error, etc.: signed in, just couldn't read it now.
        return UsageOutcome::Temporary;
    }

    let Ok(body) = response.bytes().await else {
        return UsageOutcome::Temporary;
    };
    let Some(mut usage) = provider.parse_usage(&body) else {
        return UsageOutcome::Temporary;
    };

    // Fall back to the plan the credential carried when the response did not name one.
    usage.plan = usage.plan.or(auth.plan);

    UsageOutcome::Usage(usage)
}
