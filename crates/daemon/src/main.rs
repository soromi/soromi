use std::sync::Arc;

use soromi_protocol::KeepAwakeMode;
use tokio::net::TcpListener;

use soromi_daemon::accounts::store::FileAccountManager;
use soromi_daemon::config::port;
use soromi_daemon::keep_awake::backend::create_keep_awake;
use soromi_daemon::keep_awake::controller::KeepAwakeController;
use soromi_daemon::notifications::controller::NotificationController;
use soromi_daemon::notifications::notifier::create_notifier;
use soromi_daemon::transport::server::serve;
use soromi_daemon::workspaces::service::WorkspaceService;

/// `soromi [workspace-dir]`. Starts the WebSocket server viewports attach over. A workspace
/// dir is optional: given one, it imports immediately; otherwise the daemon starts with the
/// restored spaces. Sessions run independently of any viewport, so terminals survive the GUI
/// closing.
#[tokio::main]
async fn main() {
    let notifications = Arc::new(NotificationController::new(create_notifier()));
    let keep_awake = Arc::new(KeepAwakeController::new(
        create_keep_awake(),
        KeepAwakeMode::Off,
    ));
    let hub = WorkspaceService::new(notifications.clone(), keep_awake.clone());
    let accounts = Arc::new(FileAccountManager);

    let restored = hub.names().len();
    if restored > 0 {
        println!("soromi: restored {restored} space(s) from local storage");
    }

    if let Some(dir) = std::env::args().nth(1) {
        match hub.open_workspace(&dir) {
            Ok(result) => {
                let warning = result
                    .warning
                    .map(|warning| format!(" ({warning})"))
                    .unwrap_or_default();
                println!("soromi: imported \"{}\"{warning}", result.workspace);
            }
            Err(error) => eprintln!("soromi: could not import {dir}: {error}"),
        }
    }

    let port = port();
    let listener = match TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("soromi: could not bind port {port}: {error}");
            std::process::exit(1);
        }
    };
    println!("soromi: listening on ws://localhost:{port}");

    tokio::select! {
        _ = serve(listener, hub.clone(), accounts) => {}
        _ = shutdown() => {}
    }

    notifications.dispose();
    keep_awake.dispose();
    hub.dispose();
}

async fn shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term = signal(SignalKind::terminate()).expect("install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
