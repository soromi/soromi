//! Pins the JSON wire format against the TypeScript `@soromi/protocol` zod schemas: kebab-case
//! `type` tags, camelCase fields, the `type` rename on directory entries, and omitted optionals.

use std::collections::HashMap;

use serde_json::{Value, json};
use soromi_protocol::{
    AccountProfile, AgentAccount, ChatCursor, ChatEvent, ChatFile, ClientMessage, DeviceRoute,
    DeviceSummary, DirEntry, EntryKind, IncompatibleAction, KeepAwakeMode, PermissionMode,
    ProviderConfig, RemoteConfig, RemoteDefaults, ServerMessage, SessionMode, SessionSummary,
    SlashCommand, Status, SubAgent, WorkspaceSummary,
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
            chat: None,
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
            mode: None,
        },
        json!({ "type": "open-session", "workspace": "kazomi", "agent": "claude" }),
    );
    assert_client(
        ClientMessage::OpenSession {
            workspace: "kazomi".into(),
            agent: "codex".into(),
            account: Some("work".into()),
            mode: Some(SessionMode::Chat),
        },
        json!({
            "type": "open-session",
            "workspace": "kazomi",
            "agent": "codex",
            "account": "work",
            "mode": "chat"
        }),
    );
}

#[test]
fn client_register_push_carries_a_token_or_takes_it_back() {
    assert_client(
        ClientMessage::RegisterPush {
            token: Some("ExponentPushToken[abc]".into()),
        },
        json!({ "type": "register-push", "token": "ExponentPushToken[abc]" }),
    );
    assert_client(
        ClientMessage::RegisterPush { token: None },
        json!({ "type": "register-push", "token": null }),
    );
    // A client may leave the token out to the same effect.
    assert_eq!(
        serde_json::from_value::<ClientMessage>(json!({ "type": "register-push" })).unwrap(),
        ClientMessage::RegisterPush { token: None },
    );
}

#[test]
fn git_messages_name_the_folder_and_default_to_the_root() {
    assert_client(
        ClientMessage::GitStatus {
            workspace: "kazomi".into(),
            folder: "apps/web".into(),
        },
        json!({ "type": "git-status", "workspace": "kazomi", "folder": "apps/web" }),
    );
    assert_client(
        ClientMessage::GitDiff {
            workspace: "kazomi".into(),
            folder: "".into(),
            path: "src/a.ts".into(),
            staged: true,
        },
        json!({
            "type": "git-diff", "workspace": "kazomi", "folder": "", "path": "src/a.ts",
            "staged": true
        }),
    );
    // A client from before folders existed asks about the root.
    assert_eq!(
        serde_json::from_value::<ClientMessage>(
            json!({ "type": "git-status", "workspace": "kazomi" })
        )
        .unwrap(),
        ClientMessage::GitStatus {
            workspace: "kazomi".into(),
            folder: "".into(),
        },
    );
    assert_server(
        ServerMessage::GitDiff {
            workspace: "kazomi".into(),
            folder: "api".into(),
            path: "main.rs".into(),
            staged: false,
            patch: "+x".into(),
            truncated: false,
        },
        json!({
            "type": "git-diff", "workspace": "kazomi", "folder": "api", "path": "main.rs",
            "staged": false, "patch": "+x", "truncated": false
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
            name: None,
            accounts: vec![AgentAccount {
                id: "work".into(),
                agent: "claude".into(),
            }],
            folders: vec!["api".into(), "web".into()],
            root: None,
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
fn server_session_opened() {
    assert_server(
        ServerMessage::SessionOpened {
            workspace: "kazomi".into(),
            session: SessionSummary {
                id: "s1".into(),
                agent: "claude".into(),
                account: "work".into(),
                status: Status::Idle,
                title: None,
                subagents: Vec::new(),
                activity: None,
                mode: SessionMode::Terminal,
                permission_mode: PermissionMode::Default,
                model: None,
                effort: None,
                context_tokens: None,
            },
        },
        json!({
            "type": "session-opened",
            "workspace": "kazomi",
            "session": {
                "id": "s1",
                "agent": "claude",
                "account": "work",
                "status": "idle",
                "mode": "terminal",
                "permissionMode": "default"
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
                    subagents: vec![SubAgent {
                        name: "Map v1 to v2".into(),
                        status: Status::Thinking,
                        started_at: Some(1_700_000_000),
                    }],
                    activity: Some("Editing config.ts".into()),
                    mode: SessionMode::Terminal,
                    permission_mode: PermissionMode::Default,
                    model: None,
                    effort: None,
                    context_tokens: Some(120_000),
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
                    "title": "build",
                    "subagents": [{ "name": "Map v1 to v2", "status": "thinking", "started_at": 1_700_000_000 }],
                    "activity": "Editing config.ts",
                    "mode": "terminal",
                    "permissionMode": "default",
                    "context_tokens": 120_000
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
            image: None,
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
    // A picture says what kind it is; its content is the bytes in base64.
    assert_server(
        ServerMessage::FileContent {
            workspace: "kazomi".into(),
            path: "logo.png".into(),
            content: "iVBORw0".into(),
            truncated: false,
            binary: false,
            image: Some("image/png".into()),
        },
        json!({
            "type": "file-content", "workspace": "kazomi", "path": "logo.png",
            "content": "iVBORw0", "truncated": false, "binary": false, "image": "image/png"
        }),
    );
}

#[test]
fn a_tool_result_carries_its_pictures_only_when_it_has_some() {
    assert_eq!(
        serde_json::to_value(ChatEvent::ToolResult {
            id: "t1".into(),
            ok: true,
            text: "done".into(),
            files: Vec::new(),
        })
        .unwrap(),
        json!({ "kind": "tool-result", "id": "t1", "ok": true, "text": "done" }),
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

#[test]
fn hello_and_welcome_carry_the_protocol_version() {
    assert_client(
        ClientMessage::Hello {
            protocol: 2,
            client_id: "c-1".into(),
        },
        json!({ "type": "hello", "protocol": 2, "clientId": "c-1" }),
    );
    assert_server(
        ServerMessage::Welcome {
            protocol: 2,
            version: "1.0.0".into(),
        },
        json!({ "type": "welcome", "protocol": 2, "version": "1.0.0" }),
    );
    assert_server(
        ServerMessage::Incompatible {
            protocol: 2,
            action: IncompatibleAction::UpdateClient,
        },
        json!({ "type": "incompatible", "protocol": 2, "action": "update-client" }),
    );
}

#[test]
fn client_detach_names_the_session() {
    assert_client(
        ClientMessage::Detach {
            session: "s1".into(),
        },
        json!({ "type": "detach", "session": "s1" }),
    );
}

#[test]
fn ping_and_pong_echo_a_nonce() {
    assert_client(
        ClientMessage::Ping { nonce: 7 },
        json!({ "type": "ping", "nonce": 7 }),
    );
    assert_server(
        ServerMessage::Pong { nonce: 7 },
        json!({ "type": "pong", "nonce": 7 }),
    );
}

#[test]
fn chat_delta_appends_by_default_and_flags_a_replace() {
    // The common case (an appended chunk) carries no `replace` key at all.
    assert_server(
        ServerMessage::ChatDelta {
            session: "s1".into(),
            text: "lo".into(),
            replace: false,
        },
        json!({ "type": "chat-delta", "session": "s1", "text": "lo" }),
    );
    assert_server(
        ServerMessage::ChatDelta {
            session: "s1".into(),
            text: String::new(),
            replace: true,
        },
        json!({ "type": "chat-delta", "session": "s1", "text": "", "replace": true }),
    );
}

#[test]
fn session_updates_and_commands_travel_per_session() {
    assert_server(
        ServerMessage::Attached {
            session: "s1".into(),
            slot: 3,
        },
        json!({ "type": "attached", "session": "s1", "slot": 3 }),
    );
    assert_server(
        ServerMessage::SessionCommands {
            session: "s1".into(),
            commands: vec![SlashCommand {
                name: "recap".into(),
                description: Some("Generate a recap".into()),
            }],
        },
        json!({
            "type": "session-commands",
            "session": "s1",
            "commands": [{ "name": "recap", "description": "Generate a recap" }]
        }),
    );
}

#[test]
fn pairing_messages_carry_a_code_and_a_relay() {
    assert_server(
        ServerMessage::DevicePaired {
            device: DeviceSummary {
                id: "d1".into(),
                name: "Phone".into(),
                pairing_code: "soromi://pair#abc".into(),
                connected: false,
                route: None,
            },
        },
        json!({
            "type": "device-paired",
            "device": {
                "id": "d1",
                "name": "Phone",
                "pairingCode": "soromi://pair#abc",
                "connected": false
            }
        }),
    );
    assert_client(
        ClientMessage::SetRemoteConfig {
            config: RemoteConfig {
                relay_url: "wss://relay.example".into(),
                access_key: "secret".into(),
                direct: false,
            },
        },
        json!({
            "type": "set-remote-config",
            "config": { "relayUrl": "wss://relay.example", "accessKey": "secret", "direct": false }
        }),
    );
}

#[test]
fn a_device_is_told_its_direct_routes_and_the_desktop_which_route_it_is_on() {
    assert_server(
        ServerMessage::Routes {
            routes: vec!["ws://192.168.1.20:8318".into()],
        },
        json!({ "type": "routes", "routes": ["ws://192.168.1.20:8318"] }),
    );
    // Turning direct access off is an empty list, which a device takes as "forget them".
    assert_server(
        ServerMessage::Routes { routes: Vec::new() },
        json!({ "type": "routes", "routes": [] }),
    );
    assert_server(
        ServerMessage::DeviceList {
            devices: vec![DeviceSummary {
                id: "d1".into(),
                name: "Phone".into(),
                pairing_code: "soromi://pair#abc".into(),
                connected: true,
                route: Some(DeviceRoute::Direct),
            }],
        },
        json!({
            "type": "device-list",
            "devices": [{
                "id": "d1",
                "name": "Phone",
                "pairingCode": "soromi://pair#abc",
                "connected": true,
                "route": "direct"
            }]
        }),
    );
    // The settings screen is told what was overridden (nothing here) and what an empty field means.
    assert_server(
        ServerMessage::RemoteConfig {
            config: RemoteConfig {
                relay_url: String::new(),
                access_key: String::new(),
                direct: true,
            },
            defaults: RemoteDefaults {
                relay_url: "wss://relay.example".into(),
                access_key: "soromi".into(),
            },
        },
        json!({
            "type": "remote-config",
            "config": { "relayUrl": "", "accessKey": "", "direct": true },
            "defaults": { "relayUrl": "wss://relay.example", "accessKey": "soromi" }
        }),
    );
    // A settings message from before the option existed leaves direct access on.
    let config: RemoteConfig =
        serde_json::from_value(json!({ "relayUrl": "wss://r", "accessKey": "k" })).unwrap();
    assert!(config.direct);
}

#[test]
fn chat_is_numbered_so_a_viewport_can_come_back_to_it() {
    // A returning viewport says how much it holds.
    assert_client(
        ClientMessage::Attach {
            session: "s1".into(),
            chat: Some(ChatCursor {
                log: "a1b2".into(),
                seq: 41,
            }),
        },
        json!({ "type": "attach", "session": "s1", "chat": { "log": "a1b2", "seq": 41 } }),
    );
    assert_server(
        ServerMessage::ChatResumed {
            session: "s1".into(),
        },
        json!({ "type": "chat-resumed", "session": "s1" }),
    );
    assert_server(
        ServerMessage::Chat {
            session: "s1".into(),
            events: vec![ChatEvent::Assistant { text: "hi".into() }],
            seq: 42,
        },
        json!({
            "type": "chat",
            "session": "s1",
            "events": [{ "kind": "assistant", "text": "hi" }],
            "seq": 42
        }),
    );
    assert_server(
        ServerMessage::ChatReset {
            session: "s1".into(),
            log: "c3d4".into(),
            seq: 7,
        },
        json!({ "type": "chat-reset", "session": "s1", "log": "c3d4", "seq": 7 }),
    );
}

#[test]
fn file_bytes_are_left_out_of_chat_and_fetched_by_place() {
    // In a chat event the file is a stub; `deferred` is only written when set.
    assert_server(
        ServerMessage::Chat {
            session: "s1".into(),
            events: vec![ChatEvent::User {
                text: "look".into(),
                files: vec![ChatFile {
                    media_type: "image/png".into(),
                    data: String::new(),
                    filename: Some("shot.png".into()),
                    deferred: true,
                }],
            }],
            seq: 3,
        },
        json!({
            "type": "chat",
            "session": "s1",
            "events": [{
                "kind": "user",
                "text": "look",
                "files": [{
                    "mediaType": "image/png",
                    "data": "",
                    "filename": "shot.png",
                    "deferred": true
                }]
            }],
            "seq": 3
        }),
    );
    assert_client(
        ClientMessage::ChatFetchFile {
            session: "s1".into(),
            log: "c3d4".into(),
            seq: 3,
            index: 0,
        },
        json!({ "type": "chat-fetch-file", "session": "s1", "log": "c3d4", "seq": 3, "index": 0 }),
    );
    assert_server(
        ServerMessage::ChatFileData {
            session: "s1".into(),
            log: "c3d4".into(),
            seq: 3,
            index: 0,
            file: ChatFile {
                media_type: "image/png".into(),
                data: "aGk=".into(),
                filename: None,
                deferred: false,
            },
        },
        json!({
            "type": "chat-file-data",
            "session": "s1",
            "log": "c3d4",
            "seq": 3,
            "index": 0,
            "file": { "mediaType": "image/png", "data": "aGk=" }
        }),
    );
}

#[test]
fn a_terminal_reports_its_size() {
    assert_server(
        ServerMessage::TerminalSize {
            session: "s1".into(),
            cols: 120,
            rows: 40,
        },
        json!({ "type": "terminal-size", "session": "s1", "cols": 120, "rows": 40 }),
    );
}
