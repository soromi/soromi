use std::sync::Arc;

use soromi_protocol::{KeepAwakeMode, Launcher};
use tokio::net::TcpListener;

use soromi_daemon::accounts::store::FileAccountManager;
use soromi_daemon::cli::{self, Command};
use soromi_daemon::config::port;
use soromi_daemon::instance::{AlreadyRunning, Instance};
use soromi_daemon::keep_awake::backend::create_keep_awake;
use soromi_daemon::keep_awake::controller::KeepAwakeController;
use soromi_daemon::notifications::controller::NotificationController;
use soromi_daemon::notifications::notifier::create_notifier;
use soromi_daemon::sound::player::create_sound_player;
use soromi_daemon::transport::server;
use soromi_daemon::workspaces::service::WorkspaceService;

/// `soromi [serve] [workspace-dir]` runs the daemon; the other commands (`soromi help`) are
/// clients of the one already running. See `serve`.
#[tokio::main]
async fn main() {
    // Invoked as an agent-event bridge (`soromi hook <cue> <agent>`): deliver it and exit.
    if let Some(invocation) = soromi_daemon::hooks::bridge::invocation() {
        soromi_daemon::hooks::bridge::deliver(&invocation);
        return;
    }

    match cli::parse(std::env::args().skip(1)) {
        Ok(Command::Serve { dir }) => serve(dir).await,
        Ok(command) => std::process::exit(cli::run(command).await),
        Err(error) => {
            eprintln!("soromi: {error}\n\n{}", cli::USAGE);
            std::process::exit(2);
        }
    }
}

/// Starts the WebSocket server viewports attach over. A workspace dir is optional: given one, it
/// imports immediately; otherwise the daemon starts with the restored spaces. Sessions run
/// independently of any viewport, so terminals survive the GUI closing.
async fn serve(dir: Option<String>) {
    // One daemon to a home: a second would run the same workspaces' agents over again.
    let instance = match Instance::claim() {
        Ok(instance) => instance,
        Err(AlreadyRunning(info)) => {
            match info {
                Some(info) => eprintln!(
                    "soromi: already running ({}, port {}). `soromi status` says more.",
                    match info.launcher {
                        Launcher::Desktop => "the desktop app",
                        Launcher::Cli => "started from a terminal",
                        Launcher::Service => "as a service",
                    },
                    info.port
                ),
                None => eprintln!("soromi: another daemon is already running on this Soromi home"),
            }
            // A code of its own, so the desktop app can tell this apart and use the one running.
            std::process::exit(soromi_daemon::instance::ALREADY_RUNNING_EXIT);
        }
    };
    let notifications = Arc::new(NotificationController::standard(create_notifier()));
    let keep_awake = Arc::new(KeepAwakeController::new(
        create_keep_awake(),
        KeepAwakeMode::Off,
    ));
    let hub = WorkspaceService::new(
        notifications.clone(),
        keep_awake.clone(),
        create_sound_player(),
        // Terminal-launched: this process already has the full shell PATH.
        None,
    );
    let accounts = Arc::new(FileAccountManager);

    let restored = hub.names().len();
    if restored > 0 {
        println!("soromi: restored {restored} space(s) from local storage");
    }

    // Notify-only update check: polls GitHub releases and flags newer builds to viewports.
    soromi_daemon::updates::spawn(hub.clone());

    if let Some(dir) = dir {
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
    // What a local client presents to get in; only this user can read where it is kept.
    let token = soromi_daemon::transport::local::token();
    // Where the `soromi` commands find this daemon (the desktop app picks its port at random).
    instance.publish(port, soromi_daemon::system::host().launcher, &token);

    // Dial the relay too, if configured (SOROMI_RELAY_URL + SOROMI_RELAY_ROOM), so a phone can
    // reach this daemon off-network.
    soromi_daemon::transport::relay::spawn_from_env(hub.clone(), accounts.clone());

    // Paired devices: dial the relay per device, and listen for them on the network so one nearby
    // can skip the relay; the local link can create/list/revoke them.
    let pairing = soromi_daemon::pairing::PairingService::new(
        hub.clone(),
        accounts.clone(),
        soromi_daemon::pairing::relay_url(),
        soromi_daemon::pairing::access_key(),
        soromi_daemon::pairing::direct_settings(),
    );

    tokio::select! {
        _ = server::serve(listener, hub.clone(), accounts, pairing, token) => {}
        _ = shutdown() => {}
    }

    notifications.dispose();
    keep_awake.dispose();
    hub.dispose();
    drop(instance);
}

async fn shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
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
