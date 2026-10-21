//! The key to the daemon's trusted local link. Its loopback port can be reached by every account
//! on the machine, and by any web page open in a browser on it; what keeps them out is a token
//! only this user can read. It is in `daemon.json` (owner-only), and the desktop app and the
//! `soromi` commands present it as `?token=` on the URL they connect to.

/// How the desktop app hands the daemon it starts the token to take.
const TOKEN_ENV: &str = "SOROMI_LOCAL_TOKEN";

/// The token this daemon's local link takes: the one it was started with, else a fresh one.
pub fn token() -> String {
    std::env::var(TOKEN_ENV)
        .ok()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
        .unwrap_or_else(random_token)
}

/// The URL to reach the local link on `port`, presenting `token` when there is one.
pub fn url(port: u16, token: Option<&str>) -> String {
    match token {
        Some(token) => format!("ws://127.0.0.1:{port}/?token={token}"),
        None => format!("ws://127.0.0.1:{port}"),
    }
}

/// Whether a connection presents the token, as `token=` in the query of the URL it asked for.
pub fn presents(query: Option<&str>, token: &str) -> bool {
    query
        .into_iter()
        .flat_map(|query| query.split('&'))
        .filter_map(|pair| pair.strip_prefix("token="))
        .any(|given| same(given.as_bytes(), token.as_bytes()))
}

/// Compares in time that does not depend on where the two differ, so the token cannot be guessed a
/// character at a time by timing the refusals.
fn same(given: &[u8], token: &[u8]) -> bool {
    given.len() == token.len()
        && given
            .iter()
            .zip(token)
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            == 0
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("system RNG");

    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_token_opens_the_local_link() {
        let token = random_token();
        assert_eq!(token.len(), 64);
        assert!(presents(Some(&format!("token={token}")), &token));
        assert!(presents(Some(&format!("a=1&token={token}")), &token));
        assert!(!presents(Some("token=guess"), &token));
        assert!(!presents(Some(&format!("token={}", &token[..63])), &token));
        assert!(!presents(Some(""), &token));
        assert!(!presents(None, &token));
    }

    #[test]
    fn the_url_carries_the_token_when_there_is_one() {
        assert_eq!(url(8317, Some("abc")), "ws://127.0.0.1:8317/?token=abc");
        assert_eq!(url(8317, None), "ws://127.0.0.1:8317");
    }
}
