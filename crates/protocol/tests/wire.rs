//! Pins the JSON wire format against the TypeScript `@soromi/protocol` zod schemas: kebab-case
//! `type` tags, camelCase fields, the `type` rename on directory entries, and omitted optionals.

use std::collections::HashMap;

use serde_json::{json, Value};
use soromi_protocol::{
    AccountProfile, ClientMessage, DirEntry, EntryKind, KeepAwakeMode, ProviderConfig,
    ServerMessage, Status, WorkspaceSummary,
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
            workspace: "kazomi".into(),
        },
        json!({ "type": "attach", "workspace": "kazomi" }),
    );
    assert_client(
        ClientMessage::Resize {
            workspace: "kazomi".into(),
            cols: 120,
            rows: 40,
        },
        json!({ "type": "resize", "workspace": "kazomi", "cols": 120, "rows": 40 }),
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
            workspace: "kazomi".into(),
            status: Status::WaitingInput,
        },
        json!({ "type": "status", "workspace": "kazomi", "status": "waiting-input" }),
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
                agent: "claude".into(),
                account: "personal".into(),
                folders: vec!["api".into()],
            }],
        },
        json!({
            "type": "workspace-list",
            "workspaces": [{
                "name": "kazomi",
                "status": "idle",
                "agent": "claude",
                "account": "personal",
                "folders": ["api"]
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
