//! Pins the JSON wire format against the TypeScript `@soromi/protocol` zod schemas: kebab-case
//! `type` tags, camelCase fields, the `type` rename on directory entries, and omitted optionals.

use std::collections::HashMap;

use serde_json::{Value, json};
use soromi_protocol::{
    AccountProfile, AgentAccount, ClientMessage, DirEntry, EntryKind, KeepAwakeMode,
    ProviderConfig, ServerMessage, SessionSummary, Status, WorkspaceSummary,
};

fn assert_client(msg: ClientMessage, expected: Value) {
    assert_eq!(serde_json::to_value(&msg).unwrap(), expected, "serialize");
    assert_eq!(
        serde_json::from_value::<ClientMessage>(expected).unwrap(),
        msg,
        "deserialize"
    );
}

fn assert_server(msg: ServerMessage, expected: Value) {
    assert_eq!(serde_json::to_value(&msg).unwrap(), expected, "serialize");
    assert_eq!(
        serde_json::from_value::<ServerMessage>(expected).unwrap(),
        msg,
        "deserialize"
    );
}

#[test]
fn client_attach_and_resize() {
    assert_client(
        ClientMessage::Attach {
            session: "s1".into(),
        },
        json!({ "type": "attach", "session": "s1" }),
    );
    assert_client(
        ClientMessage::Resize {
            session: "s1".into(),
            cols: 120,
            rows: 40,
        },
        json!({ "type": "resize", "session": "s1", "cols": 120, "rows": 40 }),
    );
}

#[test]
fn client_open_session_omits_absent_account() {
    assert_client(
        ClientMessage::OpenSession {
            workspace: "kazomi".into(),
            agent: "claude".into(),
            account: None,
        },
        json!({ "type": "open-session", "workspace": "kazomi", "agent": "claude" }),
    );
    assert_client(
        ClientMessage::OpenSession {
            workspace: "kazomi".into(),
            agent: "codex".into(),
            account: Some("work".into()),
        },
        json!({
            "type": "open-session",
            "workspace": "kazomi",
            "agent": "codex",
            "account": "work"
        }),
    );
}

#[test]
fn client_close_session() {
    assert_client(
        ClientMessage::CloseSession {
            session: "s1".into(),
        },
        json!({ "type": "close-session", "session": "s1" }),
    );
}

#[test]
fn client_rename_session() {
    assert_client(
        ClientMessage::RenameSession {
            session: "s1".into(),
            title: "build".into(),
        },
        json!({ "type": "rename-session", "session": "s1", "title": "build" }),
    );
}

#[test]
fn client_update_space_carries_account_bindings() {
    assert_client(
        ClientMessage::UpdateSpace {
            workspace: "kazomi".into(),
            accounts: vec![AgentAccount {
                id: "work".into(),
                agent: "claude".into(),
            }],
            folders: vec!["api".into(), "web".into()],
            instructions: Some("Prefer TypeScript".into()),
        },
        json!({
            "type": "update-space",
            "workspace": "kazomi",
            "accounts": [{ "id": "work", "agent": "claude" }],
            "folders": ["api", "web"],
            "instructions": "Prefer TypeScript"
        }),
    );
}

#[test]
fn server_output_and_session_opened() {
    assert_server(
        ServerMessage::Output {
            session: "s1".into(),
            data: "hi".into(),
        },
        json!({ "type": "output", "session": "s1", "data": "hi" }),
    );
    assert_server(
        ServerMessage::SessionOpened {
            workspace: "kazomi".into(),
            session: SessionSummary {
                id: "s1".into(),
                agent: "claude".into(),
                account: "work".into(),
                status: Status::Idle,
                title: None,
            },
        },
        json!({
            "type": "session-opened",
            "workspace": "kazomi",
            "session": {
                "id": "s1",
                "agent": "claude",
                "account": "work",
                "status": "idle"
            }
        }),
    );
}

#[test]
fn client_list_workspaces_is_a_bare_tag() {
    assert_client(
        ClientMessage::ListWorkspaces,
        json!({ "type": "list-workspaces" }),
    );
}

#[test]
fn client_create_space_omits_absent_folders() {
    assert_client(
        ClientMessage::CreateSpace {
            name: "kazomi".into(),
            root: "/w/kazomi".into(),
            agent: "claude".into(),
            account: "personal".into(),
            folders: None,
        },
        json!({
            "type": "create-space",
            "name": "kazomi",
            "root": "/w/kazomi",
            "agent": "claude",
            "account": "personal"
        }),
    );
    assert_client(
        ClientMessage::CreateSpace {
            name: "kazomi".into(),
            root: "/w/kazomi".into(),
            agent: "claude".into(),
            account: "personal".into(),
            folders: Some(vec!["api".into(), "web".into()]),
        },
        json!({
            "type": "create-space",
            "name": "kazomi",
            "root": "/w/kazomi",
            "agent": "claude",
            "account": "personal",
            "folders": ["api", "web"]
        }),
    );
}

#[test]
fn client_set_keep_awake_mode() {
    assert_client(
        ClientMessage::SetKeepAwakeMode {
            mode: KeepAwakeMode::Always,
        },
        json!({ "type": "set-keep-awake-mode", "mode": "always" }),
    );
}

#[test]
fn client_save_account_nests_provider_config() {
    let mut env = HashMap::new();
    env.insert("CLAUDE_CONFIG_DIR".to_string(), "/x".to_string());
    let mut providers = HashMap::new();
    providers.insert(
        "claude".to_string(),
        ProviderConfig {
            env: Some(env),
            config_dir: Some("/x".into()),
        },
    );
    assert_client(
        ClientMessage::SaveAccount {
            profile: AccountProfile {
                name: "work".into(),
                providers,
            },
        },
        json!({
            "type": "save-account",
            "profile": {
                "name": "work",
                "providers": {
                    "claude": { "env": { "CLAUDE_CONFIG_DIR": "/x" }, "configDir": "/x" }
                }
            }
        }),
    );
}

#[test]
fn client_export_space() {
    assert_client(
        ClientMessage::ExportSpace {
            workspace: "kazomi".into(),
        },
        json!({ "type": "export-space", "workspace": "kazomi" }),
    );
}

#[test]
fn server_space_exported() {
    assert_server(
        ServerMessage::SpaceExported {
            workspace: "kazomi".into(),
            path: "/w/kazomi/soromi.space.json".into(),
        },
        json!({
            "type": "space-exported",
            "workspace": "kazomi",
            "path": "/w/kazomi/soromi.space.json"
        }),
    );
}

#[test]
fn server_status_uses_kebab_status_value() {
    assert_server(
        ServerMessage::Status {
            session: "s1".into(),
            status: Status::WaitingInput,
        },
        json!({ "type": "status", "session": "s1", "status": "waiting-input" }),
    );
}

#[test]
fn server_keep_awake_carries_active_and_mode() {
    assert_server(
        ServerMessage::KeepAwake {
            active: false,
            mode: KeepAwakeMode::Working,
        },
        json!({ "type": "keep-awake", "active": false, "mode": "working" }),
    );
}

#[test]
fn server_workspace_list_and_summary() {
    assert_server(
        ServerMessage::WorkspaceList {
            workspaces: vec![WorkspaceSummary {
                name: "kazomi".into(),
                status: Status::Idle,
                root: "/w/kazomi".into(),
                folders: vec!["api".into()],
                accounts: vec![AgentAccount {
                    id: "personal".into(),
                    agent: "claude".into(),
                }],
                sessions: vec![SessionSummary {
                    id: "s1".into(),
                    agent: "claude".into(),
                    account: "personal".into(),
                    status: Status::Idle,
                    title: Some("build".into()),
                }],
                instructions: None,
            }],
        },
        json!({
            "type": "workspace-list",
            "workspaces": [{
                "name": "kazomi",
                "status": "idle",
                "root": "/w/kazomi",
                "folders": ["api"],
                "accounts": [{ "id": "personal", "agent": "claude" }],
                "sessions": [{
                    "id": "s1",
                    "agent": "claude",
                    "account": "personal",
                    "status": "idle",
                    "title": "build"
                }]
            }]
        }),
    );
}

#[test]
fn server_dir_listing_renames_entry_type() {
    assert_server(
        ServerMessage::DirListing {
            workspace: "kazomi".into(),
            path: "api".into(),
            entries: vec![
                DirEntry {
                    name: "src".into(),
                    kind: EntryKind::Dir,
                    ignored: false,
                },
                DirEntry {
                    name: "node_modules".into(),
                    kind: EntryKind::Dir,
                    ignored: true,
                },
            ],
        },
        json!({
            "type": "dir-listing",
            "workspace": "kazomi",
            "path": "api",
            "entries": [
                { "name": "src", "type": "dir", "ignored": false },
                { "name": "node_modules", "type": "dir", "ignored": true }
            ]
        }),
    );
}

#[test]
fn server_file_content_flags() {
    assert_server(
        ServerMessage::FileContent {
            workspace: "kazomi".into(),
            path: "api/x.ts".into(),
            content: "contents".into(),
            truncated: false,
            binary: false,
        },
        json!({
            "type": "file-content",
            "workspace": "kazomi",
            "path": "api/x.ts",
            "content": "contents",
            "truncated": false,
            "binary": false
        }),
    );
}

#[test]
fn server_workspace_opened_omits_absent_warning() {
    assert_server(
        ServerMessage::WorkspaceOpened {
            workspace: "kazomi".into(),
            warning: None,
        },
        json!({ "type": "workspace-opened", "workspace": "kazomi" }),
    );
    assert_server(
        ServerMessage::WorkspaceOpened {
            workspace: "kazomi".into(),
            warning: Some("no profile".into()),
        },
        json!({ "type": "workspace-opened", "workspace": "kazomi", "warning": "no profile" }),
    );
}

#[test]
fn check_update_and_up_to_date_are_bare_tags() {
    assert_client(
        ClientMessage::CheckUpdate,
        json!({ "type": "check-update" }),
    );
    assert_server(ServerMessage::UpToDate, json!({ "type": "up-to-date" }));
}

#[test]
fn server_update_available_omits_absent_notes() {
    assert_server(
        ServerMessage::UpdateAvailable {
            version: "0.2.0".into(),
            url: "https://example.com/v0.2.0".into(),
            notes: None,
        },
        json!({
            "type": "update-available",
            "version": "0.2.0",
            "url": "https://example.com/v0.2.0"
        }),
    );
}
