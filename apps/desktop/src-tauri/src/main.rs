// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use soromi_daemon::accounts::store::FileAccountManager;
use soromi_daemon::keep_awake::backend::create_keep_awake;
use soromi_daemon::keep_awake::controller::KeepAwakeController;
use soromi_daemon::notifications::controller::NotificationController;
use soromi_daemon::notifications::notifier::create_notifier;
use soromi_daemon::transport::server::serve;
use soromi_daemon::workspaces::service::WorkspaceService;
use soromi_protocol::KeepAwakeMode;

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Start the in-process daemon on an ephemeral local port, then hand its URL to the
            // webview. Binding + hub creation run on Tauri's tokio runtime (the hub spawns
            // status watchers, which need a runtime).
            let (state, port) = tauri::async_runtime::block_on(async {
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                    .await
                    .expect("bind daemon port");
                let port = listener.local_addr().expect("daemon addr").port();

                let notifications = Arc::new(NotificationController::new(create_notifier()));
                let keep_awake = Arc::new(KeepAwakeController::new(
                    create_keep_awake(),
                    KeepAwakeMode::Off,
                ));
                let hub = WorkspaceService::new(notifications.clone(), keep_awake.clone());
                let accounts = Arc::new(FileAccountManager);

                let serve_hub = hub.clone();
                tauri::async_runtime::spawn(serve(listener, serve_hub, accounts));

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

            // Build the main window with the daemon URL injected before any page script runs.
            let script = format!("window.__SOROMI_DAEMON_URL__ = \"ws://localhost:{port}\";");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Soromi")
                .inner_size(1200.0, 800.0)
                .initialization_script(&script)
                .build()?;

            // Tray: closing the window only hides it, so the daemon keeps agents running; Quit
            // stops everything.
            let show = MenuItemBuilder::with_id("show", "Show Soromi").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("bundle icon"))
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.state::<DaemonState>().shutdown();
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of exit; the daemon (and agents) stay alive.
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the Soromi desktop shell");
}
