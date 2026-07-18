// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_notification::NotificationExt;

use soromi_daemon::accounts::store::FileAccountManager;
use soromi_daemon::keep_awake::backend::create_keep_awake;
use soromi_daemon::keep_awake::controller::KeepAwakeController;
use soromi_daemon::notifications::controller::NotificationController;
use soromi_daemon::notifications::notifier::{Notification, Notifier};
use soromi_daemon::sound::player::create_sound_player;
use soromi_daemon::transport::server::serve;
use soromi_daemon::workspaces::service::WorkspaceService;
use soromi_protocol::KeepAwakeMode;

/// Sends notifications through Tauri, so they carry the Soromi app identity and icon (unlike
/// `osascript`, which posts as Script Editor).
struct TauriNotifier {
    app: AppHandle,
}

impl Notifier for TauriNotifier {
    fn notify(&self, notification: Notification) {
        let _ = self
            .app
            .notification()
            .builder()
            .title(notification.title)
            .body(notification.message)
            .show();
    }
}

/// Held in Tauri state so the daemon can be torn down cleanly on Quit.
struct DaemonState {
    hub: Arc<WorkspaceService>,
    keep_awake: Arc<KeepAwakeController>,
    notifications: Arc<NotificationController>,
}

impl DaemonState {
    fn shutdown(&self) {
        self.notifications.dispose();
        self.keep_awake.dispose();
        self.hub.dispose();
    }
}

/// Quits the app (the "Quit Soromi" menu item). Routes through the normal exit flow, so the
/// daemon is disposed via `RunEvent::ExitRequested`.
#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

/// Resolves the login shell's PATH, so the in-process daemon can launch agents with the same
/// PATH a terminal would have (a GUI-launched app inherits only a minimal one). Returns it for
/// the daemon to use as its session PATH, rather than mutating this process's environment.
#[cfg(target_os = "macos")]
fn detect_launch_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = std::process::Command::new(shell)
        .args(["-ilc", "printf %s \"$PATH\""])
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    let path = String::from_utf8(output.stdout).ok()?;
    let path = path.trim();
    if path.is_empty() {
        None
    } else {
        Some(path.to_string())
    }
}

#[cfg(not(target_os = "macos"))]
fn detect_launch_path() -> Option<String> {
    None
}

fn main() {
    // Invoked as an agent-event bridge (`<exe> hook <cue> <agent>`) by a Claude hook: deliver
    // the event to the running daemon over its socket and exit, before any Tauri/window init.
    if let Some(invocation) = soromi_daemon::hooks::bridge::invocation() {
        soromi_daemon::hooks::bridge::deliver(&invocation);
        return;
    }

    // The daemon launches sessions with this PATH (a GUI launch has only a minimal one).
    let launch_path = detect_launch_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![quit])
        .setup(move |app| {
            let handle = app.handle().clone();
            // Ask for notification permission up front so the first banner isn't dropped.
            let _ = handle.notification().request_permission();
            // Start the in-process daemon on an ephemeral local port, then hand its URL to the
            // webview. Binding + hub creation run on Tauri's tokio runtime (the hub spawns
            // status watchers, which need a runtime).
            let (state, port) = tauri::async_runtime::block_on(async {
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                    .await
                    .expect("bind daemon port");
                let port = listener.local_addr().expect("daemon addr").port();

                let notifier: Arc<dyn Notifier> = Arc::new(TauriNotifier { app: handle });
                let notifications = Arc::new(NotificationController::new(notifier));
                let keep_awake = Arc::new(KeepAwakeController::new(
                    create_keep_awake(),
                    KeepAwakeMode::Off,
                ));
                let hub = WorkspaceService::new(
                    notifications.clone(),
                    keep_awake.clone(),
                    create_sound_player(),
                    launch_path.clone(),
                );
                let accounts = Arc::new(FileAccountManager);

                // Dial the relay too, if configured (SOROMI_RELAY_URL + SOROMI_RELAY_ROOM), so a
                // phone can reach this daemon off-network.
                soromi_daemon::transport::relay::spawn_from_env(hub.clone(), accounts.clone());

                // Paired devices: dial the relay per device; the local link manages them.
                let pairing = soromi_daemon::pairing::PairingService::new(
                    hub.clone(),
                    accounts.clone(),
                    soromi_daemon::pairing::relay_url(),
                    soromi_daemon::pairing::web_url(),
                    soromi_daemon::pairing::access_key(),
                );

                let serve_hub = hub.clone();
                tauri::async_runtime::spawn(serve(listener, serve_hub, accounts, pairing));

                // Notify-only update check: flags newer releases to the viewport.
                soromi_daemon::updates::spawn(hub.clone());

                (
                    DaemonState {
                        hub,
                        keep_awake,
                        notifications,
                    },
                    port,
                )
            });
            app.manage(state);

            // Build the main window with the daemon URL and app version injected before any
            // page script runs.
            let version = app.package_info().version.to_string();
            let script = format!(
                "window.__SOROMI_DAEMON_URL__ = \"ws://localhost:{port}\"; window.__SOROMI_VERSION__ = \"{version}\";"
            );
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Soromi")
                .inner_size(1200.0, 800.0)
                .initialization_script(&script)
                .build()?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                // Hide instead of exit, so the in-process daemon (and its agents) stay alive.
                // Clicking the dock icon reopens the window (see RunEvent::Reopen below).
                let _ = window.hide();
                api.prevent_close();
                // A hidden window is "away", so events should fire again.
                window.state::<DaemonState>().hub.set_focused(false);
            }
            // Suppress agent-event sounds/banners while the window has focus; fire when away.
            WindowEvent::Focused(focused) => {
                window.state::<DaemonState>().hub.set_focused(*focused);
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building the Soromi desktop shell")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            // Quit (Cmd+Q / app menu): stop the daemon, kill agents, release keep-awake.
            RunEvent::ExitRequested { .. } => {
                app.state::<DaemonState>().shutdown();
            }
            _ => {}
        });
}
