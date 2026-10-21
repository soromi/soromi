use std::io;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde_json::Value;
use soromi_protocol::{
    AgentUsage, ChatEvent, ChatFile, ModelOption, PermissionMode, ProviderModels, SlashCommand,
    Status, ToolApproval,
};

pub mod claude;
pub mod codex;
pub mod grok;
pub mod usage;

/// What one line of a provider's headless chat output means, in provider-agnostic terms. Each
/// provider parses its own wire format (Claude's stream-json frames, Codex's `exec --json` events)
/// into these, and the daemon's chat session pumps them onto its channels without knowing either
/// format — so a provider owns *all* of its chat logic and the session is just plumbing.
pub enum ChatFrame {
    /// Conversation content (assistant prose, reasoning, tool calls/results, a system notice).
    Events(Vec<ChatEvent>),
    /// A streaming token appended to the assistant message being written.
    Delta(String),
    /// A turn-lifecycle change (typically `Idle` when a turn ends).
    Status(Status),
    /// A tool is awaiting approval; the daemon parks it (with the raw `input` to echo back on allow)
    /// and asks the user.
    Approval(ToolApproval, Value),
    /// The provider's available slash commands (from its session-init frame).
    Commands(Vec<SlashCommand>),
    /// The provider's own conversation id, captured so a later turn/launch can resume it. (The
    /// per-line context size stays on `context_tokens`, since one frame can carry content *and* it.)
    SessionId(String),
    /// Nothing to surface.
    Ignore,
}

/// What a provider says about an agent running beside the conversation. Each says what is true,
/// not what changed, so hearing one twice (a stream and a transcript can both carry it) is harmless.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskSignal {
    /// The agent `task` is at work.
    Running {
        /// The id the provider gives the agent for as long as it lives.
        task: String,
        /// The tool call that started it, or the message that set it going again, when known.
        tool: Option<String>,
        /// What it is doing, in a few words, when the line says.
        name: Option<String>,
        /// Whether it carries on after the tool call that started it returns. `None` when the line
        /// does not say, which leaves what is known as it is.
        background: Option<bool>,
    },
    /// The agent `task` stopped: it finished, failed, or was stopped.
    Ended {
        task: String,
        tool: Option<String>,
        /// What it was doing, when the line says: kept in case it is set going again.
        name: Option<String>,
    },
}

/// A conversation a provider keeps on disk, as a list of earlier ones shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conversation {
    /// The provider's own id for it, which resumes it.
    pub id: String,
    /// The name it was given, or else the start of its first prompt.
    pub title: String,
    /// The start of the last thing asked in it, when that is not its first prompt.
    pub last_prompt: Option<String>,
    /// When it was last added to.
    pub updated: SystemTime,
    /// The file it is kept in.
    pub path: PathBuf,
}

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

    /// Whether the provider can pin a *caller-chosen* conversation id (via `apply_session_id`). When
    /// it can (Claude's `--session-id`), Soromi's `session.id` is itself a valid conversation id, so a
    /// tab resumes by it even before any id is captured. When it can't (Codex only issues its own
    /// ids), Soromi's `session.id` is meaningless to the agent — so resume is attempted *only* with an
    /// id the agent actually issued (captured into `resume_id`), never our `session.id`. Default: no.
    fn can_pin_session_id(&self) -> bool {
        false
    }

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
    fn transcript_path(
        &self,
        _config_dir: &Path,
        _cwd: &str,
        _id: &str,
    ) -> Option<std::path::PathBuf> {
        None
    }

    /// The conversations this provider kept for a working folder, in no particular order: what a
    /// workspace can pick up again. None by default, for a provider that keeps none it can list.
    fn conversations(&self, _config_dir: &Path, _cwd: &str) -> Vec<Conversation> {
        Vec::new()
    }

    /// One of them, by its id.
    fn conversation(&self, _config_dir: &Path, _cwd: &str, _id: &str) -> Option<Conversation> {
        None
    }

    /// Whether what was said in a kept conversation (the prompts and the replies, not what tools
    /// returned) matches `query`.
    fn conversation_mentions(&self, _path: &Path, _query: &regex::bytes::Regex) -> bool {
        false
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

    /// Where a background agent of the conversation at `transcript` writes its own conversation,
    /// by the id its `SubAgent` carries (see [`soromi_protocol::SubAgent::id`]). `None` while it has
    /// written nothing, or for a provider that keeps no such logs (the default).
    fn agent_log_path(&self, _transcript: &Path, _agent: &str) -> Option<PathBuf> {
        None
    }

    /// One line of a background agent's own log as chat events: its prompt, tool calls and
    /// replies, which the main conversation's parser leaves out as the agent's business.
    fn parse_agent_log_line(&self, _line: &str) -> Vec<ChatEvent> {
        Vec::new()
    }

    /// The id of the entry on one line of this provider's transcript, if its entries have ids.
    ///
    /// A transcript is not always a plain log of what happened in order. Claude writes the messages
    /// it keeps a second time when it compacts a conversation: the same entries, with the same
    /// ids, appended after everything said since. Read top to bottom, old messages then turn up
    /// twice, the second time as if they were the latest. An entry's first appearance is where it
    /// happened, so a reader that takes each id once gets the conversation as it went (see
    /// `transcript::Reader`). Default: entries have no ids, and every line is read.
    fn transcript_entry_id<'a>(&self, _line: &'a str) -> Option<&'a str> {
        None
    }

    /// What a line of this provider's output (a stream frame, or a transcript entry) says about
    /// agents running beside the conversation: one started in the background, is still at work, or
    /// stopped. The session keeps its "agents working" list from these, so an agent that outlives
    /// the turn that started it stays listed until the provider says it ended. Default: the
    /// provider has no such agents, and says nothing.
    fn task_signals(&self, _line: &str) -> Vec<TaskSignal> {
        Vec::new()
    }

    /// If a tool approval is really the agent asking to leave "plan mode" and start executing (not a
    /// tool to run), the full plan text to show for review — else `None`. The session layer stays
    /// provider-agnostic: it tags such an approval as a `"plan"` kind so every provider's plan renders
    /// the same, and only the provider knows which of its tools means this (Claude's `ExitPlanMode`).
    /// Default: the provider has no plan-mode concept.
    fn plan_approval_body(&self, _tool_name: &str, _input: &serde_json::Value) -> Option<String> {
        None
    }

    /// The messages that change the model + reasoning effort live in the headless chat (Claude sends
    /// `/model <alias>` and `/effort <level>` as user messages). Provider-specific syntax; the session
    /// writes each verbatim. Default: the provider can't switch model live, so nothing is sent.
    /// The composer's model picker for this provider (models + reasoning-effort ladder), or `None`
    /// to hide the picker. Each provider owns its own model names, ids, effort tokens, and context
    /// windows — the GUI holds none of that.
    fn model_catalog(&self) -> Option<ProviderModels> {
        None
    }

    fn model_commands(&self, _model: Option<&str>, _effort: Option<&str>) -> Vec<String> {
        Vec::new()
    }

    /// The provider's flag value for a permission mode (Claude's `--permission-mode` takes
    /// `default`/`acceptEdits`/`bypassPermissions`/`plan`), used both as a launch flag and in the live
    /// `set_permission_mode` control request. Default: the provider has no permission modes.
    fn permission_flag(&self, _mode: PermissionMode) -> Option<String> {
        None
    }

    /// The current context size from one stream-json frame, for the context meter: `Some(Some(n))` a
    /// new prompt+cache token count, `Some(None)` a reset (a compaction freed the window), `None` the
    /// frame carries nothing. Provider-specific usage fields. Default: no context reporting.
    fn context_tokens(&self, _line: &str) -> Option<Option<u32>> {
        None
    }

    /// One attached file (image / PDF / text) as this provider's outgoing user-message content block
    /// (Claude's Anthropic image/document/text blocks). Default: the provider takes no attachments.
    fn attachment_block(&self, _file: &ChatFile) -> Option<Value> {
        None
    }

    /// Parses one line of this provider's headless chat output into a provider-agnostic [`ChatFrame`]
    /// (Claude's stream-json frames, Codex's `exec --json` events). This is where *all* of a provider's
    /// chat parsing lives; the daemon session just pumps the frames. Default: nothing surfaced.
    fn parse_chat_frame(&self, _line: &str) -> ChatFrame {
        ChatFrame::Ignore
    }

    /// For a provider whose chat runs **one process per turn** (Codex's `codex exec`), the command
    /// args for a turn: the prompt, the resume id (its own captured session id, if any), and the
    /// model/effort/permission choices. `None` means the provider isn't driven per-turn (Claude runs
    /// one persistent process instead — see `headless_stream_json_args`). `program` comes separately.
    fn chat_turn_command(
        &self,
        _prompt: &str,
        _resume_id: Option<&str>,
        _model: Option<&str>,
        _effort: Option<&str>,
        _permission: PermissionMode,
    ) -> Option<Vec<String>> {
        None
    }

    /// Whether this provider's headless chat is driven one process per turn (Codex) rather than one
    /// persistent stream-json process (Claude). The daemon picks the matching session pump.
    fn chat_is_per_turn(&self) -> bool {
        false
    }

    /// A one-line description for a slash command ("action") this provider exposes, or `None` if
    /// unknown. Annotates the chat `/` menu; `cwd` locates project-local custom commands. Default:
    /// the provider surfaces no descriptions (the menu shows the bare command name).
    fn describe_command(&self, _name: &str, _cwd: &Path) -> Option<String> {
        None
    }

    /// The slash commands to expose *before* the agent's own list arrives. Claude only sends its
    /// `system/init` (the full command list) after the first turn, so without a seed the chat `/`
    /// menu is empty until you've sent a message. This is that seed — the built-in commands plus any
    /// project/user custom ones — replaced by the real list once the agent reports it. Default: none.
    fn default_commands(&self, _cwd: &Path) -> Vec<SlashCommand> {
        Vec::new()
    }
}

/// The provider registry. Add a provider by adding it here.
const PROVIDERS: &[&dyn Provider] = &[&claude::Claude, &codex::Codex, &grok::Grok];

/// The provider for a key or command basename, if known.
pub fn provider(key: &str) -> Option<&'static dyn Provider> {
    PROVIDERS.iter().copied().find(|p| p.key() == key)
}

/// Builds one `ModelOption` for a provider's catalog (`value` = launch id/alias; `None` = default).
pub(crate) fn model_option(
    value: Option<&str>,
    label: &str,
    description: &str,
    effort: bool,
    context_limit: u32,
) -> ModelOption {
    ModelOption {
        value: value.map(String::from),
        label: label.to_string(),
        description: description.to_string(),
        effort,
        context_limit,
    }
}

/// Builds the effort-label map from `(token, display)` pairs.
pub(crate) fn effort_labels(pairs: &[(&str, &str)]) -> std::collections::HashMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// Every provider's model-picker catalog, keyed by provider key (providers with no picker are
/// omitted). Sent to the GUI in the `ModelCatalog` message.
pub fn all_catalogs() -> std::collections::HashMap<String, ProviderModels> {
    PROVIDERS
        .iter()
        .filter_map(|p| p.model_catalog().map(|c| (p.key().to_string(), c)))
        .collect()
}
