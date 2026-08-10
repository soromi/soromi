use std::io;
use std::path::Path;

use soromi_protocol::{AgentUsage, ChatEvent, Status};

pub mod claude;
pub mod codex;
pub mod grok;
pub mod usage;

/// What a provider needs to fetch its plan usage: the endpoint, the bearer token, and any extra
/// headers (account id, beta opt-ins). Built fresh from the account's credentials each call, so a
/// re-login is picked up without restart. `plan` is set when the tier is known from the credential
/// itself (some providers, like Claude, carry it there rather than in the usage response).
pub struct UsageAuth {
    pub url: &'static str,
    pub bearer: String,
    pub headers: Vec<(&'static str, String)>,
    pub plan: Option<String>,
}

/// The state of an account's usage credential, resolved before any network call.
pub enum UsageAuthState {
    /// Ready to call the usage endpoint.
    Ready(UsageAuth),
    /// Signed in, but the login lacks the scope usage needs, known from the credential itself (so
    /// we skip the call and tell the user to re-login).
    MissingScope,
    /// No usage endpoint, or the account is not signed in.
    None,
}

/// A coding-agent provider (Claude, Codex, ...). Everything provider-specific lives behind this
/// trait, so adding a provider is a new file here plus one registry entry, not edits scattered
/// across the daemon (launch flags, login checks, event hooks, resume, and later usage).
pub trait Provider: Send + Sync {
    /// The provider key, matching the workspace `agent` field and the command basename (`claude`).
    fn key(&self) -> &'static str;

    /// The executable to launch. Defaults to the key.
    fn command(&self) -> &'static str {
        self.key()
    }

    /// The env var that points the agent at an isolated config dir (e.g. `CLAUDE_CONFIG_DIR`).
    fn config_env_var(&self) -> &'static str;

    /// The config dir under `$HOME` when that env var is unset (e.g. `.claude`).
    fn default_config_dir(&self) -> &'static str;

    /// The credential file (relative to the config dir) that marks a logged-in dir.
    fn credential_file(&self) -> &'static str;

    /// An optional top-level JSON key in that file that must exist and be non-null (an account).
    /// `None` means the file existing is enough.
    fn credential_key(&self) -> Option<&'static str> {
        None
    }

    /// Whether a config dir looks logged in: the credential file exists and, if required, carries
    /// a non-null account key (the token itself may live in the OS keychain).
    fn is_logged_in(&self, config_dir: &Path) -> bool {
        let Ok(contents) = std::fs::read_to_string(config_dir.join(self.credential_file())) else {
            return false;
        };

        match self.credential_key() {
            None => true,
            Some(key) => serde_json::from_str::<serde_json::Value>(&contents)
                .ok()
                .and_then(|value| value.get(key).cloned())
                .is_some_and(|value| !value.is_null()),
        }
    }

    /// CLI flag naming an extra working directory (one per picked folder), if the provider has one.
    fn add_dir_flag(&self) -> Option<&'static str> {
        None
    }

    /// CLI flag appending workspace instructions to the agent's system prompt, if it has one.
    fn system_prompt_flag(&self) -> Option<&'static str> {
        None
    }

    /// Adds the args to resume a prior conversation by its (agent-generated) id. A no-op default
    /// means the provider cannot resume, so its tabs always start fresh.
    fn apply_resume(&self, _args: &mut Vec<String>, _resume_id: &str) {}

    /// Adds the args to start a *fresh* conversation pinned to a specific id, so Soromi owns the
    /// conversation id from the first turn and can deterministically resume it later (in either the
    /// terminal or the headless chat backend). A no-op default means the provider can't pin an id and
    /// simply starts fresh with its own generated one.
    fn apply_session_id(&self, _args: &mut Vec<String>, _id: &str) {}

    /// Base args that put this provider into headless `stream-json` mode (the "chat" backend), or
    /// `None` if it has no such mode. The caller appends the shared bits (session-id/resume, add-dir,
    /// system prompt) with the same methods the terminal launch uses. Approvals and model/effort are
    /// layered on in later phases.
    fn headless_stream_json_args(&self) -> Option<Vec<String>> {
        None
    }

    /// Whether a prior conversation still exists to resume (given the account config dir + the tab's
    /// working dir). Guards against a stale id (an unused tab, a pruned conversation, a changed cwd)
    /// that would make the agent error on launch. The default assumes yes.
    fn resume_available(&self, _config_dir: &Path, _cwd: &str, _resume_id: &str) -> bool {
        true
    }

    /// The on-disk transcript for a conversation id, if this provider keeps one. Used to seed the
    /// headless chat backend with the prior conversation on resume (the CLI doesn't replay it on
    /// stdout). `None` means the provider has no readable transcript.
    fn transcript_path(&self, _config_dir: &Path, _cwd: &str, _id: &str) -> Option<std::path::PathBuf> {
        None
    }

    /// Where this provider keeps skills/slash-commands: the per-project config folder (e.g.
    /// `.claude`) and the slash-command subfolder (e.g. `commands`). `None` means no skills.
    fn skill_dirs(&self) -> Option<(&'static str, &'static str)> {
        None
    }

    /// Installs Soromi's agent-event hooks into this account's config dir, so permission / done /
    /// session-start events reach the daemon reliably (no terminal parsing).
    fn install_hooks(&self, config_dir: &Path) -> io::Result<()>;

    /// Resolves this account's usage credential from the config dir, before any network call. The
    /// default has no usage endpoint. Providers can also report `MissingScope` up front when the
    /// credential shows the login can't read usage (avoids a doomed request).
    fn usage_auth(&self, _config_dir: &Path) -> UsageAuthState {
        UsageAuthState::None
    }

    /// Parses a usage response body into the shared shape. `None` on any shape the provider does not
    /// recognize (an error page, a changed schema), so a bad response is simply omitted.
    fn parse_usage(&self, _body: &[u8]) -> Option<AgentUsage> {
        None
    }

    /// Derives a coarse working/waiting status from a chunk of raw PTY output. This is a fallback
    /// for when the provider's authoritative hooks miss or aren't installed; each provider knows its
    /// own terminal wording (Claude's whimsical spinner, Codex's TUI, ...). `None` when the chunk
    /// carries no signal. Default: the provider offers no terminal heuristic (status stays idle
    /// until a hook speaks).
    fn parse_status(&self, _chunk: &str) -> Option<Status> {
        None
    }

    /// Parses one line of this provider's on-disk transcript into chat events (chat text, tool
    /// calls, sub-agents), which drive the chat view, the per-tab activity line, and the sub-agent
    /// list. Each provider writes a different format (Claude's JSONL, Codex's rollout, ...). Default:
    /// the provider has no transcript format Soromi reads, so nothing is surfaced.
    fn parse_transcript_line(&self, _line: &str) -> Vec<ChatEvent> {
        Vec::new()
    }

    /// A one-line description for a slash command ("action") this provider exposes, or `None` if
    /// unknown. Annotates the chat `/` menu; `cwd` locates project-local custom commands. Default:
    /// the provider surfaces no descriptions (the menu shows the bare command name).
    fn describe_command(&self, _name: &str, _cwd: &Path) -> Option<String> {
        None
    }
}

/// The provider registry. Add a provider by adding it here.
const PROVIDERS: &[&dyn Provider] = &[&claude::Claude, &codex::Codex, &grok::Grok];

/// The provider for a key or command basename, if known.
pub fn provider(key: &str) -> Option<&'static dyn Provider> {
    PROVIDERS.iter().copied().find(|p| p.key() == key)
}
