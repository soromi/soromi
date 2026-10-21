//! The `soromi` command line. With no command (or `serve`) the binary is the daemon; the other
//! commands are small clients of a daemon that is already running on this machine, so a computer
//! with no screen (a server) can pair a phone and add workspaces from a shell.

mod client;
mod commands;
mod qr;
pub mod service;

use std::path::Path;

pub use commands::run;

/// What the daemon is asked to be called on a phone it pairs, when no name is given.
const DEFAULT_DEVICE_NAME: &str = "Phone";
/// The agent a workspace added from the shell runs, when none is given.
const DEFAULT_AGENT: &str = "claude";
/// The account a workspace added from the shell uses, when none is given: the one the desktop and
/// the phone start a workspace with. It is created empty if missing, which runs the agent as this
/// machine's user, under its usual login.
const DEFAULT_ACCOUNT: &str = "personal";

/// One invocation of the binary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    /// Run the daemon, importing `dir` first when one is given.
    Serve {
        dir: Option<String>,
    },
    /// Pair a new device and show its QR code, then wait for it to connect.
    Pair {
        name: String,
    },
    /// Say whether the daemon is running, and on what, started how.
    Status,
    /// Set this machine up in one go: the service, a check of the agents, and a phone paired.
    Setup {
        name: String,
        pair: bool,
    },
    /// The daemon as a service of this user's (systemd on Linux, launchd on a Mac).
    Service(service::ServiceAction),
    /// List the paired devices.
    Devices,
    /// Forget a paired device, by its id (or the start of it) or its name.
    Revoke {
        device: String,
    },
    /// List the workspaces.
    Spaces,
    /// Add a folder as a workspace: its `soromi.space.json` when it has one, otherwise the whole
    /// folder with one agent.
    Add {
        dir: String,
        name: Option<String>,
        agent: String,
        account: String,
    },
    /// Remove a workspace (its files stay where they are).
    Remove {
        workspace: String,
    },
    Help,
    Version,
}

/// The usage text `soromi help` prints.
pub const USAGE: &str = "\
Usage: soromi [command]

  setup [name]       Set this machine up: run Soromi as a service, check the agents, pair a phone.
      --pair               Pair another phone even when one is paired already
  serve [dir]        Run the daemon (the default). A dir with a soromi.space.json is added first.
  status             Whether the daemon is running here, and how it was started.
  service <action>   The daemon as a service, started with the machine:
                     install [--direct] | uninstall | status | restart | logs
  pair [name]        Pair a phone: shows a QR code to scan in the Soromi app, then waits for it.
  devices            List the paired devices.
  revoke <device>    Forget a paired device (its id, the start of it, or its name).
  spaces             List the workspaces.
  add <dir>          Add a folder as a workspace.
      --name <name>        What to call it (default: the folder's name)
      --agent <agent>      The agent it runs (default: claude)
      --account <account>  The account it uses (default: personal, this user's own login)
  remove <workspace> Remove a workspace. Its files are left alone.
  help               Show this.
  version            Show the version.

Every command but serve talks to the daemon already running on this machine (SOROMI_PORT).";

/// Reads the arguments after the program name.
pub fn parse<I, S>(args: I) -> Result<Command, String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut args = args.into_iter().map(Into::into);
    let Some(first) = args.next() else {
        return Ok(Command::Serve { dir: None });
    };
    let rest: Vec<String> = args.collect();

    let command = match first.as_str() {
        "serve" => Command::Serve {
            dir: at_most_one(&first, rest)?,
        },
        "pair" => Command::Pair {
            name: if rest.is_empty() {
                DEFAULT_DEVICE_NAME.to_string()
            } else {
                rest.join(" ")
            },
        },
        "status" => none(&first, rest, Command::Status)?,
        "setup" => parse_setup(rest)?,
        "service" => Command::Service(parse_service(rest)?),
        "devices" => none(&first, rest, Command::Devices)?,
        "revoke" => Command::Revoke {
            device: exactly_one(&first, rest, "a device")?,
        },
        "spaces" => none(&first, rest, Command::Spaces)?,
        "add" => parse_add(rest)?,
        "remove" => Command::Remove {
            workspace: exactly_one(&first, rest, "a workspace")?,
        },
        "help" | "-h" | "--help" => Command::Help,
        "version" | "-V" | "--version" => Command::Version,
        // `soromi <dir>`, as the daemon has always been started. Only a folder that exists counts,
        // so a mistyped command is reported rather than started as a daemon.
        other if rest.is_empty() && Path::new(other).is_dir() => {
            Command::Serve { dir: Some(first) }
        }
        other => return Err(format!("unknown command \"{other}\"")),
    };

    Ok(command)
}

fn parse_setup(rest: Vec<String>) -> Result<Command, String> {
    let pair = rest.iter().any(|arg| arg == "--pair");
    let words: Vec<String> = rest.into_iter().filter(|arg| arg != "--pair").collect();
    if let Some(flag) = words.iter().find(|word| word.starts_with("--")) {
        return Err(format!("unknown option \"{flag}\""));
    }
    Ok(Command::Setup {
        name: if words.is_empty() {
            DEFAULT_DEVICE_NAME.to_string()
        } else {
            words.join(" ")
        },
        pair,
    })
}

fn parse_service(rest: Vec<String>) -> Result<service::ServiceAction, String> {
    use service::ServiceAction;
    let mut words = rest.into_iter();
    let action = words
        .next()
        .ok_or("service needs an action: install, uninstall, status, restart or logs")?;
    let flags: Vec<String> = words.collect();
    let direct = flags.iter().any(|flag| flag == "--direct");
    if let Some(flag) = flags.iter().find(|flag| *flag != "--direct") {
        return Err(format!("unknown option \"{flag}\""));
    }
    let parsed = match action.as_str() {
        "install" => ServiceAction::Install { direct },
        "uninstall" => ServiceAction::Uninstall,
        "status" => ServiceAction::Status,
        "restart" => ServiceAction::Restart,
        "logs" => ServiceAction::Logs,
        other => return Err(format!("unknown service action \"{other}\"")),
    };
    if direct && !matches!(parsed, ServiceAction::Install { .. }) {
        return Err("--direct goes with install".to_string());
    }
    Ok(parsed)
}

fn parse_add(rest: Vec<String>) -> Result<Command, String> {
    let mut dir = None;
    let mut name = None;
    let mut agent = DEFAULT_AGENT.to_string();
    let mut account = DEFAULT_ACCOUNT.to_string();

    let mut args = rest.into_iter();
    while let Some(arg) = args.next() {
        let mut value = |flag: &str| args.next().ok_or_else(|| format!("{flag} needs a value"));
        match arg.as_str() {
            "--name" => name = Some(value("--name")?),
            "--agent" => agent = value("--agent")?,
            "--account" => account = value("--account")?,
            flag if flag.starts_with("--") => return Err(format!("unknown option \"{flag}\"")),
            _ if dir.is_some() => return Err("add takes one folder".to_string()),
            _ => dir = Some(arg),
        }
    }

    Ok(Command::Add {
        dir: dir.ok_or("add needs a folder")?,
        name,
        agent,
        account,
    })
}

fn none(command: &str, rest: Vec<String>, parsed: Command) -> Result<Command, String> {
    if rest.is_empty() {
        Ok(parsed)
    } else {
        Err(format!("{command} takes no arguments"))
    }
}

fn at_most_one(command: &str, rest: Vec<String>) -> Result<Option<String>, String> {
    match <[String; 1]>::try_from(rest) {
        Ok([one]) => Ok(Some(one)),
        Err(rest) if rest.is_empty() => Ok(None),
        Err(_) => Err(format!("{command} takes at most one argument")),
    }
}

fn exactly_one(command: &str, rest: Vec<String>, what: &str) -> Result<String, String> {
    match <[String; 1]>::try_from(rest) {
        Ok([one]) => Ok(one),
        Err(_) => Err(format!("{command} needs {what}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(args: &[&str]) -> Result<Command, String> {
        parse(args.iter().copied())
    }

    #[test]
    fn no_command_runs_the_daemon_and_so_does_a_folder() {
        assert_eq!(parsed(&[]), Ok(Command::Serve { dir: None }));
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_string_lossy().into_owned();
        assert_eq!(
            parsed(&[&path]),
            Ok(Command::Serve {
                dir: Some(path.clone())
            })
        );
        assert_eq!(
            parsed(&["serve", &path]),
            Ok(Command::Serve { dir: Some(path) })
        );
    }

    #[test]
    fn a_mistyped_command_is_reported_not_started() {
        assert!(parsed(&["piar"]).unwrap_err().contains("unknown command"));
    }

    #[test]
    fn a_phone_is_named_from_the_rest_of_the_line() {
        assert_eq!(
            parsed(&["pair"]),
            Ok(Command::Pair {
                name: "Phone".to_string()
            })
        );
        assert_eq!(
            parsed(&["pair", "Juan's", "iPad"]),
            Ok(Command::Pair {
                name: "Juan's iPad".to_string()
            })
        );
    }

    #[test]
    fn add_takes_a_folder_and_its_options_in_any_order() {
        assert_eq!(
            parsed(&["add", "--agent", "codex", "~/code/app", "--name", "app"]),
            Ok(Command::Add {
                dir: "~/code/app".to_string(),
                name: Some("app".to_string()),
                agent: "codex".to_string(),
                account: "personal".to_string(),
            })
        );
        assert!(parsed(&["add"]).is_err());
        assert!(parsed(&["add", "a", "b"]).is_err());
        assert!(parsed(&["add", "a", "--agent"]).is_err());
        assert!(parsed(&["add", "a", "--colour", "red"]).is_err());
    }

    #[test]
    fn setup_and_service_read_their_options() {
        use service::ServiceAction;
        assert_eq!(
            parsed(&["setup"]),
            Ok(Command::Setup {
                name: "Phone".to_string(),
                pair: false
            })
        );
        assert_eq!(
            parsed(&["setup", "My", "iPhone", "--pair"]),
            Ok(Command::Setup {
                name: "My iPhone".to_string(),
                pair: true
            })
        );
        assert_eq!(
            parsed(&["service", "install"]),
            Ok(Command::Service(ServiceAction::Install { direct: false }))
        );
        assert_eq!(
            parsed(&["service", "install", "--direct"]),
            Ok(Command::Service(ServiceAction::Install { direct: true }))
        );
        assert_eq!(
            parsed(&["service", "logs"]),
            Ok(Command::Service(ServiceAction::Logs))
        );
        assert!(parsed(&["service"]).is_err());
        assert!(parsed(&["service", "explode"]).is_err());
        assert!(parsed(&["service", "status", "--direct"]).is_err());
        assert!(parsed(&["setup", "--colour"]).is_err());
    }

    #[test]
    fn commands_check_how_many_arguments_they_get() {
        assert!(parsed(&["revoke"]).is_err());
        assert_eq!(
            parsed(&["revoke", "abc"]),
            Ok(Command::Revoke {
                device: "abc".to_string()
            })
        );
        assert!(parsed(&["devices", "extra"]).is_err());
        assert!(parsed(&["serve", "a", "b"]).is_err());
    }
}
