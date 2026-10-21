use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use anyhow::{Context, bail};
use soromi_protocol::{
    AccountProfile, ClientMessage, DeviceRoute, DeviceSummary, HostInfo, Launcher, ServerMessage,
    Status, WorkspaceSummary,
};

use super::client::LocalClient;
use super::{Command, DEFAULT_ACCOUNT, USAGE, qr};

/// How often `pair` looks for the new phone, and for how long.
const PAIR_POLL: Duration = Duration::from_secs(2);
const PAIR_WAIT: Duration = Duration::from_secs(10 * 60);

/// Runs a command other than `serve` and returns the process's exit code.
pub async fn run(command: Command) -> i32 {
    let result = match command {
        Command::Serve { .. } => unreachable!("the binary serves itself"),
        Command::Help => {
            println!("{USAGE}");
            Ok(())
        }
        Command::Version => {
            println!("soromi {}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        Command::Status => status().await,
        Command::Setup { name, pair: again } => setup(name, again).await,
        Command::Service(action) => super::service::run(action),
        Command::Pair { name } => pair(name).await,
        Command::Devices => devices().await,
        Command::Revoke { device } => revoke(&device).await,
        Command::Spaces => spaces().await,
        Command::Add {
            dir,
            name,
            agent,
            account,
        } => add(&dir, name, agent, account).await,
        Command::Remove { workspace } => remove(&workspace).await,
    };

    match result {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("soromi: {error:#}");
            1
        }
    }
}

async fn pair(name: String) -> anyhow::Result<()> {
    let mut client = LocalClient::connect().await?;
    let device = client
        .request(
            ClientMessage::CreateDevice { name },
            |message| match message {
                ServerMessage::DevicePaired { device } => Some(device),
                _ => None,
            },
        )
        .await?;

    println!("{}", qr::render(&device.pairing_code)?);
    println!("Scan this with the Soromi app, or paste this code into it:\n");
    println!("{}\n", device.pairing_code);
    println!(
        "Waiting for \"{}\" to connect. Ctrl-C stops waiting; the pairing stays until \
         `soromi revoke {}`.",
        device.name,
        short_id(&device.id)
    );

    let deadline = tokio::time::Instant::now() + PAIR_WAIT;
    while tokio::time::Instant::now() < deadline {
        tokio::time::sleep(PAIR_POLL).await;
        let devices = list_devices(&mut client).await?;
        let Some(now) = devices.iter().find(|one| one.id == device.id) else {
            bail!("\"{}\" was revoked while waiting", device.name);
        };
        if now.connected {
            println!("\"{}\" is connected ({}).", now.name, connection(now));
            client.close().await;
            return Ok(());
        }
    }

    println!("Stopped waiting. The code above still pairs it.");
    client.close().await;
    Ok(())
}

/// How long a service just started has to answer.
const SERVICE_START: Duration = Duration::from_secs(20);

async fn setup(name: String, pair_another: bool) -> anyhow::Result<()> {
    println!("1. Soromi as a service");
    super::service::run(super::service::ServiceAction::Install { direct: false })?;
    let mut client = wait_for_daemon().await?;

    println!("\n2. The agents");
    agents_check();

    let workspaces = list_workspaces(&mut client).await?;
    let devices = list_devices(&mut client).await?;
    client.close().await;
    println!("\n3. Workspaces");
    if workspaces.is_empty() {
        println!("   None yet. Add one with `soromi add <folder>`, or from the phone (its +).");
    } else {
        println!(
            "   {} workspace{}: `soromi spaces` lists them.",
            workspaces.len(),
            plural(workspaces.len())
        );
    }

    println!("\n4. Your phone");
    if !devices.is_empty() && !pair_another {
        let names: Vec<&str> = devices.iter().map(|d| d.name.as_str()).collect();
        println!(
            "   Paired already: {}. `soromi setup --pair` pairs another.",
            names.join(", ")
        );
        return Ok(());
    }
    pair(name).await
}

/// The daemon the service just started, once it answers.
async fn wait_for_daemon() -> anyhow::Result<LocalClient> {
    let deadline = tokio::time::Instant::now() + SERVICE_START;
    loop {
        match LocalClient::connect().await {
            Ok(client) => return Ok(client),
            Err(error) if tokio::time::Instant::now() >= deadline => {
                return Err(
                    error.context("the service did not start; `soromi service logs` says why")
                );
            }
            Err(_) => tokio::time::sleep(Duration::from_millis(500)).await,
        }
    }
}

/// Whether each agent Soromi runs is installed and logged in, and how to fix it when not.
fn agents_check() {
    for agent in AGENT_SETUP {
        let installed = crate::system::first_on_path(&[agent.command]).is_some();
        let logged_in = crate::providers::provider(agent.command)
            .map(|provider| format!("~/{}", provider.default_config_dir()))
            .is_some_and(|dir| crate::accounts::provider::is_logged_in(agent.command, &dir));
        match (installed, logged_in) {
            (true, true) => println!("   ✓ {}: installed and logged in", agent.label),
            (true, false) => println!(
                "   ! {}: installed, not logged in. Run `{}`.",
                agent.label, agent.login
            ),
            // Only the one most use is suggested; the others are left alone when absent.
            (false, _) if agent.suggested => println!(
                "   ! {}: not installed. `{}`, then `{}`.",
                agent.label, agent.install, agent.login
            ),
            (false, _) => {}
        }
    }
}

struct AgentSetup {
    command: &'static str,
    label: &'static str,
    install: &'static str,
    login: &'static str,
    /// Suggested when it is not installed.
    suggested: bool,
}

const AGENT_SETUP: [AgentSetup; 3] = [
    AgentSetup {
        command: "claude",
        label: "Claude Code",
        install: "npm install -g @anthropic-ai/claude-code",
        login: "claude, then /login",
        suggested: true,
    },
    AgentSetup {
        command: "codex",
        label: "Codex",
        install: "npm install -g @openai/codex",
        login: "codex login",
        suggested: false,
    },
    AgentSetup {
        command: "grok",
        label: "Grok",
        install: "install the grok CLI",
        login: "grok, and sign in",
        suggested: false,
    },
];

async fn status() -> anyhow::Result<()> {
    let mut client = LocalClient::connect().await?;
    let workspaces = list_workspaces(&mut client).await?;
    let devices = list_devices(&mut client).await?;
    let (version, host, port) = (client.version.clone(), client.host.clone(), client.port);
    client.close().await;

    let connected = devices.iter().filter(|device| device.connected).count();
    println!(
        "Soromi {} is running{}.",
        version,
        host.as_ref().map(describe_host).unwrap_or_default()
    );
    println!(
        "{} workspace{}, {} paired device{} ({connected} connected). Port {}.",
        workspaces.len(),
        plural(workspaces.len()),
        devices.len(),
        plural(devices.len()),
        port
    );
    Ok(())
}

async fn devices() -> anyhow::Result<()> {
    let mut client = LocalClient::connect().await?;
    let devices = list_devices(&mut client).await?;
    client.close().await;

    if devices.is_empty() {
        println!("No devices are paired. Pair one with `soromi pair`.");
        return Ok(());
    }
    let widest = devices.iter().map(|d| d.name.chars().count()).max();
    for device in &devices {
        println!(
            "{}  {:<width$}  {}",
            short_id(&device.id),
            device.name,
            connection(device),
            width = widest.unwrap_or(0)
        );
    }
    Ok(())
}

async fn revoke(target: &str) -> anyhow::Result<()> {
    let mut client = LocalClient::connect().await?;
    let devices = list_devices(&mut client).await?;
    let device = pick_device(&devices, target)?.clone();
    client
        .request(
            ClientMessage::RevokeDevice {
                id: device.id.clone(),
            },
            |message| match message {
                ServerMessage::DeviceList { .. } => Some(()),
                _ => None,
            },
        )
        .await?;
    client.close().await;

    println!("Revoked \"{}\". It can no longer connect.", device.name);
    Ok(())
}

async fn spaces() -> anyhow::Result<()> {
    let mut client = LocalClient::connect().await?;
    let workspaces = list_workspaces(&mut client).await?;
    client.close().await;

    if workspaces.is_empty() {
        println!("No workspaces yet. Add one with `soromi add <dir>`.");
        return Ok(());
    }
    for workspace in &workspaces {
        let sessions = workspace.sessions.len();
        println!(
            "{}  {}  ({}, {} session{})",
            workspace.name,
            workspace.root,
            status_label(workspace.status),
            sessions,
            plural(sessions)
        );
    }
    Ok(())
}

async fn add(
    dir: &str,
    name: Option<String>,
    agent: String,
    account: String,
) -> anyhow::Result<()> {
    let root = std::fs::canonicalize(expand_home(dir))
        .with_context(|| format!("there is no folder at {dir}"))?;
    if !root.is_dir() {
        bail!("{dir} is not a folder");
    }
    let root_text = root.to_string_lossy().into_owned();

    let mut client = LocalClient::connect().await?;
    // The daemon takes a name it already has as that workspace, whatever folder it is given, so
    // what is there is checked here first.
    let existing = list_workspaces(&mut client).await?;
    let from_file = root.join("soromi.space.json").is_file();
    let name = name.unwrap_or_else(|| folder_name(&root));
    if let Some(there) = existing
        .iter()
        .find(|one| one.root == root_text && (from_file || one.name == name))
    {
        println!("\"{}\" is already a workspace.", there.name);
        client.close().await;
        return Ok(());
    }
    if !from_file && let Some(there) = existing.iter().find(|one| one.name == name) {
        bail!(
            "there is already a workspace called \"{name}\" (at {}); give this one another \
             with --name",
            there.root
        );
    }

    let message = if from_file {
        ClientMessage::OpenWorkspace { dir: root_text }
    } else {
        ensure_account(&mut client, &account).await?;
        ClientMessage::CreateSpace {
            name,
            root: root_text,
            agent,
            account,
            folders: None,
        }
    };
    let (workspace, warning) = client
        .request(message, |message| match message {
            ServerMessage::WorkspaceOpened { workspace, warning } => Some((workspace, warning)),
            _ => None,
        })
        .await?;
    client.close().await;

    println!("Added \"{workspace}\". It shows on paired phones now.");
    if let Some(warning) = warning {
        println!("Note: {warning}");
    }
    Ok(())
}

async fn remove(workspace: &str) -> anyhow::Result<()> {
    let mut client = LocalClient::connect().await?;
    if !list_workspaces(&mut client)
        .await?
        .iter()
        .any(|one| one.name == workspace)
    {
        bail!("there is no workspace called \"{workspace}\" (see `soromi spaces`)");
    }
    client
        .send(ClientMessage::RemoveSpace {
            workspace: workspace.to_string(),
        })
        .await?;
    client.send(ClientMessage::ListWorkspaces).await?;
    client
        .answer(|message| match message {
            ServerMessage::WorkspaceList { workspaces }
                if !workspaces.iter().any(|one| one.name == workspace) =>
            {
                Some(())
            }
            _ => None,
        })
        .await?;
    client.close().await;

    println!("Removed \"{workspace}\". Its files are where they were.");
    Ok(())
}

/// A workspace added from the shell needs its account to exist. The default one is made empty,
/// which runs the agent with this user's own login; any other has to be set up already.
async fn ensure_account(client: &mut LocalClient, account: &str) -> anyhow::Result<()> {
    let accounts = client
        .request(ClientMessage::ListAccounts, |message| match message {
            ServerMessage::AccountList { accounts } => Some(accounts),
            _ => None,
        })
        .await?;
    if accounts.iter().any(|one| one.name == account) {
        return Ok(());
    }
    if account != DEFAULT_ACCOUNT {
        let names: Vec<&str> = accounts.iter().map(|one| one.name.as_str()).collect();
        bail!(
            "there is no account called \"{account}\" (accounts here: {})",
            if names.is_empty() {
                "none".to_string()
            } else {
                names.join(", ")
            }
        );
    }

    let profile = AccountProfile {
        name: account.to_string(),
        providers: HashMap::new(),
    };
    client
        .request(
            ClientMessage::SaveAccount { profile },
            |message| match message {
                ServerMessage::AccountList { accounts } => {
                    Some(accounts.iter().any(|one| one.name == account))
                }
                _ => None,
            },
        )
        .await?
        .then_some(())
        .context("the daemon did not save the default account")
}

async fn list_devices(client: &mut LocalClient) -> anyhow::Result<Vec<DeviceSummary>> {
    client
        .request(ClientMessage::ListDevices, |message| match message {
            ServerMessage::DeviceList { devices } => Some(devices),
            _ => None,
        })
        .await
}

async fn list_workspaces(client: &mut LocalClient) -> anyhow::Result<Vec<WorkspaceSummary>> {
    client
        .request(ClientMessage::ListWorkspaces, |message| match message {
            ServerMessage::WorkspaceList { workspaces } => Some(workspaces),
            _ => None,
        })
        .await
}

/// The device a `revoke` names: its id, the start of its id, or its name, as long as only one
/// device fits.
fn pick_device<'a>(
    devices: &'a [DeviceSummary],
    target: &str,
) -> anyhow::Result<&'a DeviceSummary> {
    if let Some(exact) = devices.iter().find(|one| one.id == target) {
        return Ok(exact);
    }
    let fits: Vec<&DeviceSummary> = devices
        .iter()
        .filter(|one| one.id.starts_with(target) || one.name == target)
        .collect();
    match fits.as_slice() {
        [one] => Ok(one),
        [] => bail!("no paired device is \"{target}\" (see `soromi devices`)"),
        many => bail!(
            "\"{target}\" fits more than one device: {}",
            many.iter()
                .map(|one| format!("{} ({})", one.name, short_id(&one.id)))
                .collect::<Vec<_>>()
                .join(", ")
        ),
    }
}

/// " on \"build-box\" (Linux), as a service".
fn describe_host(host: &HostInfo) -> String {
    let os = match host.os.as_str() {
        "macos" => "macOS",
        "windows" => "Windows",
        _ => "Linux",
    };
    let started = match host.launcher {
        Launcher::Desktop => "started by the Soromi desktop app",
        Launcher::Cli => "started from a terminal",
        Launcher::Service => "as a service",
    };
    format!(" on \"{}\" ({os}), {started}", host.name)
}

fn plural(count: usize) -> &'static str {
    if count == 1 { "" } else { "s" }
}

fn short_id(id: &str) -> &str {
    id.get(..8).unwrap_or(id)
}

fn connection(device: &DeviceSummary) -> &'static str {
    match device.route {
        Some(DeviceRoute::Direct) => "connected, directly",
        Some(DeviceRoute::Relay) => "connected, through the relay",
        None if device.connected => "connected",
        None => "not connected",
    }
}

fn status_label(status: Status) -> &'static str {
    match status {
        Status::Thinking => "working",
        Status::Done => "finished",
        Status::Blocked => "blocked",
        Status::WaitingInput => "waiting for input",
        Status::Idle => "idle",
    }
}

fn folder_name(root: &Path) -> String {
    root.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "workspace".to_string())
}

/// `~/code` as a shell would read it, for a path that was quoted past the shell.
fn expand_home(dir: &str) -> std::path::PathBuf {
    match (dir.strip_prefix("~/"), dirs::home_dir()) {
        (Some(rest), Some(home)) => home.join(rest),
        _ if dir == "~" => dirs::home_dir().unwrap_or_default(),
        _ => dir.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(id: &str, name: &str) -> DeviceSummary {
        DeviceSummary {
            id: id.to_string(),
            name: name.to_string(),
            pairing_code: String::new(),
            connected: false,
            route: None,
        }
    }

    #[test]
    fn a_device_is_named_by_its_id_the_start_of_it_or_its_name() {
        let devices = [device("aaaa1111", "Phone"), device("aaaa2222", "iPad")];

        assert_eq!(pick_device(&devices, "aaaa2222").unwrap().name, "iPad");
        assert_eq!(pick_device(&devices, "aaaa1").unwrap().name, "Phone");
        assert_eq!(pick_device(&devices, "iPad").unwrap().id, "aaaa2222");
        assert!(
            pick_device(&devices, "aaaa")
                .unwrap_err()
                .to_string()
                .contains("more than one")
        );
        assert!(pick_device(&devices, "zzz").is_err());
    }
}
