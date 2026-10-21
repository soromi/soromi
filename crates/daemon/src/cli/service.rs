//! `soromi service …`: the daemon as a service of this user's, started at login (and at boot, on a
//! server) and started again if it stops. A systemd user service on Linux, a launchd agent on a
//! Mac. The service runs this very binary, through a login shell so the agents' command-line tools
//! are found as a terminal finds them.

use std::path::{Path, PathBuf};
use std::process::Command as Process;

use anyhow::{Context, bail};
use soromi_protocol::Launcher;

use crate::instance::{self, ALREADY_RUNNING_EXIT};

/// What `soromi service` was asked to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceAction {
    /// Writes the service, starts it, and has it start again with the machine. `direct` keeps the
    /// direct route (a phone on the same network or VPN); a server's phone comes through the relay.
    Install {
        direct: bool,
    },
    Uninstall,
    Status,
    Restart,
    Logs,
}

const NAME: &str = "soromi";
const LABEL: &str = "dev.soromi.daemon";

pub fn run(action: ServiceAction) -> anyhow::Result<()> {
    if cfg!(target_os = "macos") {
        launchd(action)
    } else if cfg!(target_os = "linux") {
        systemd(action)
    } else {
        bail!("a service is set up on Linux (systemd) or macOS (launchd)")
    }
}

/// Whether the daemon runs as the service already.
pub fn installed() -> bool {
    service_file().is_some_and(|path| path.is_file())
}

fn service_file() -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        Some(dirs::home_dir()?.join(format!("Library/LaunchAgents/{LABEL}.plist")))
    } else {
        Some(dirs::config_dir()?.join(format!("systemd/user/{NAME}.service")))
    }
}

/// A daemon started by hand from a terminal holds the home; the service's would step aside for it
/// and stop. It is to be stopped first.
fn refuse_a_running_daemon() -> anyhow::Result<()> {
    match instance::running() {
        Some(info) if info.launcher != Launcher::Service => bail!(
            "a Soromi daemon is already running here ({}, port {}). Stop it, then install the \
             service.",
            match info.launcher {
                Launcher::Desktop => "the desktop app",
                _ => "started from a terminal",
            },
            info.port
        ),
        _ => Ok(()),
    }
}

fn this_binary() -> anyhow::Result<PathBuf> {
    let exe = std::env::current_exe().context("cannot tell where this soromi is")?;
    Ok(exe.canonicalize().unwrap_or(exe))
}

// ---- systemd (Linux) -------------------------------------------------------

fn systemd(action: ServiceAction) -> anyhow::Result<()> {
    let unit = service_file().context("no config folder for the service")?;
    match action {
        ServiceAction::Install { direct } => {
            refuse_a_running_daemon()?;
            let exe = this_binary()?;
            std::fs::create_dir_all(unit.parent().unwrap_or(Path::new(".")))?;
            std::fs::write(&unit, systemd_unit(&exe, direct))?;
            systemctl(&["daemon-reload"])?;
            systemctl(&["enable", NAME])?;
            // Started, or started again on the binary it now names.
            systemctl(&["restart", NAME])?;
            println!("The service is running: {}", unit.display());
            keep_running_after_logout();
            Ok(())
        }
        ServiceAction::Uninstall => {
            let _ = systemctl(&["disable", "--now", NAME]);
            if unit.is_file() {
                std::fs::remove_file(&unit)?;
            }
            let _ = systemctl(&["daemon-reload"]);
            println!("The service is gone. Soromi's state is kept in ~/.soromi.");
            Ok(())
        }
        ServiceAction::Status => {
            let _ = Process::new("systemctl")
                .args(["--user", "status", NAME, "--no-pager", "--lines=5"])
                .status();
            Ok(())
        }
        ServiceAction::Restart => systemctl(&["restart", NAME]),
        ServiceAction::Logs => {
            let status = Process::new("journalctl")
                .args(["--user", "-u", NAME, "-f", "-n", "100"])
                .status()
                .context("journalctl is not here")?;
            if !status.success() {
                bail!("journalctl failed");
            }
            Ok(())
        }
    }
}

/// The systemd user service that runs `exe`.
fn systemd_unit(exe: &Path, direct: bool) -> String {
    let direct = if direct { "1" } else { "0" };
    format!(
        "# Written by `soromi service install`; `soromi service uninstall` takes it away.

[Unit]
Description=Soromi daemon
Wants=network-online.target
After=network-online.target

[Service]
# Through a login shell, so the agents' command-line tools (installed with npm, pipx, into
# ~/.local/bin, ...) are on PATH as they are in an SSH session.
ExecStart=/bin/bash -lc 'exec \"{exe}\" serve'
Environment=SOROMI_LAUNCHER=service
# The direct route is for a phone on the same network or VPN; a server's comes through the relay.
Environment=SOROMI_DIRECT={direct}
Restart=on-failure
RestartSec=3
# Another daemon already runs on this home: starting this one again would only fail again.
RestartPreventExitStatus={ALREADY_RUNNING_EXIT}

[Install]
WantedBy=default.target
",
        exe = exe.display()
    )
}

fn systemctl(args: &[&str]) -> anyhow::Result<()> {
    let output = Process::new("systemctl")
        .arg("--user")
        .args(args)
        .output()
        .context("systemctl is not here: this system does not run systemd")?;
    if !output.status.success() {
        bail!(
            "systemctl --user {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

/// A user's services stop when they log out, unless systemd is told to keep them ("linger"). On a
/// server that is what is wanted, and it starts them at boot too.
fn keep_running_after_logout() {
    let user = std::env::var("USER").unwrap_or_default();
    let lingers = Process::new("loginctl")
        .args(["show-user", &user, "--property=Linger", "--value"])
        .output()
        .is_ok_and(|output| String::from_utf8_lossy(&output.stdout).trim() == "yes");
    if lingers {
        return;
    }
    let enabled = Process::new("loginctl")
        .args(["enable-linger", &user])
        .output()
        .is_ok_and(|output| output.status.success());
    if enabled {
        println!("It keeps running after you log out, and starts when the machine does.");
    } else {
        println!(
            "To keep it running after you log out, and start it with the machine, run once:\n\n    \
             sudo loginctl enable-linger {user}\n"
        );
    }
}

// ---- launchd (macOS) -------------------------------------------------------

fn launchd(action: ServiceAction) -> anyhow::Result<()> {
    let plist = service_file().context("no home folder for the service")?;
    let domain = format!("gui/{}", user_id()?);
    let target = format!("{domain}/{LABEL}");
    match action {
        ServiceAction::Install { direct } => {
            refuse_a_running_daemon()?;
            let exe = this_binary()?;
            std::fs::create_dir_all(plist.parent().unwrap_or(Path::new(".")))?;
            std::fs::write(&plist, launchd_plist(&exe, direct, &log_file()))?;
            // Loaded afresh, on the binary it now names.
            let _ = launchctl(&["bootout", &target]);
            launchctl(&["bootstrap", &domain, &plist.to_string_lossy()])?;
            println!("The service is running: {}", plist.display());
            println!("It starts again when you log in to this Mac.");
            Ok(())
        }
        ServiceAction::Uninstall => {
            let _ = launchctl(&["bootout", &target]);
            if plist.is_file() {
                std::fs::remove_file(&plist)?;
            }
            println!("The service is gone. Soromi's state is kept in ~/.soromi.");
            Ok(())
        }
        ServiceAction::Status => {
            let output = Process::new("launchctl")
                .args(["print", &target])
                .output()?;
            if !output.status.success() {
                println!("The service is not loaded.");
                return Ok(());
            }
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines().map(str::trim) {
                if line.starts_with("state =") || line.starts_with("pid =") {
                    println!("{line}");
                }
            }
            Ok(())
        }
        ServiceAction::Restart => launchctl(&["kickstart", "-k", &target]),
        ServiceAction::Logs => {
            let status = Process::new("tail")
                .args(["-n", "100", "-f"])
                .arg(log_file())
                .status()?;
            if !status.success() {
                bail!("there is no log yet");
            }
            Ok(())
        }
    }
}

/// The launchd agent that runs `exe`, writing what it prints to `log`.
fn launchd_plist(exe: &Path, direct: bool, log: &Path) -> String {
    let direct = if direct { "1" } else { "0" };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Written by `soromi service install`; `soromi service uninstall` takes it away. -->
<plist version="1.0">
<dict>
  <key>Label</key><string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>exec "{exe}" serve</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SOROMI_LAUNCHER</key><string>service</string>
    <key>SOROMI_DIRECT</key><string>{direct}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>{log}</string>
  <key>StandardErrorPath</key><string>{log}</string>
</dict>
</plist>
"#,
        exe = escape(&exe.to_string_lossy()),
        log = escape(&log.to_string_lossy())
    )
}

fn log_file() -> PathBuf {
    crate::home::soromi_home().join("daemon.log")
}

fn user_id() -> anyhow::Result<String> {
    let output = Process::new("id").arg("-u").output()?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn launchctl(args: &[&str]) -> anyhow::Result<()> {
    let output = Process::new("launchctl").args(args).output()?;
    if !output.status.success() {
        bail!(
            "launchctl {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

/// Text as it goes inside a plist's `<string>`.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_systemd_service_runs_this_binary_and_does_not_loop_on_a_taken_home() {
        let unit = systemd_unit(Path::new("/home/me/.local/bin/soromi"), false);

        assert!(
            unit.contains(r#"ExecStart=/bin/bash -lc 'exec "/home/me/.local/bin/soromi" serve'"#)
        );
        assert!(unit.contains("Environment=SOROMI_LAUNCHER=service"));
        assert!(unit.contains("Environment=SOROMI_DIRECT=0"));
        assert!(unit.contains("RestartPreventExitStatus=3"));
        assert!(systemd_unit(Path::new("/x"), true).contains("SOROMI_DIRECT=1"));
    }

    #[test]
    fn the_launchd_agent_runs_this_binary_and_says_it_is_a_service() {
        let plist = launchd_plist(
            Path::new("/Applications/A & B/soromi"),
            true,
            Path::new("/Users/me/.soromi/daemon.log"),
        );

        assert!(plist.contains("<string>exec \"/Applications/A &amp; B/soromi\" serve</string>"));
        assert!(plist.contains("<key>SOROMI_LAUNCHER</key><string>service</string>"));
        assert!(plist.contains("<key>SOROMI_DIRECT</key><string>1</string>"));
        assert!(plist.contains("/Users/me/.soromi/daemon.log"));
    }
}
