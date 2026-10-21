# Soromi on a server

The daemon runs on any Linux machine, with or without a desktop. On a server in the cloud it does
what it does on your computer: it keeps the workspaces, the agents and their terminals, and the
phone app reaches it through the relay, end-to-end encrypted. The server dials out to the relay,
so no port has to be opened on it.

Everything here happens in an SSH session, as the user the agents should run as.

> Use a machine, or a VM, that is yours alone. The daemon trusts whatever connects to its local
> port (that is how `soromi pair` and the desktop app talk to it), so any other account on the
> same machine could reach it.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/soromi/soromi/main/scripts/install.sh | sh
```

That is all of it. The script ([`scripts/install.sh`](../scripts/install.sh)):

1. Downloads the build for this machine (Linux x86_64 or arm64, or a Mac with Apple Silicon) from
   the latest release, and checks it against its checksum.
2. Puts it at `~/.local/bin/soromi`, and says what to add to `~/.profile` if that is not on `PATH`.
3. Runs `soromi setup`, which:
   - runs Soromi as a service (a systemd user service): started now, started again if it stops,
     and kept running after you log out and when the machine reboots. Keeping it running needs
     systemd's "linger", which `setup` turns on, or tells you the one `sudo` line that does;
   - checks the agents: whether Claude Code, Codex and Grok are installed and logged in, with the
     command that fixes each one that is not;
   - shows a QR code to pair your phone: scan it in the Soromi app, or paste the code under it.

Run the same line again to update Soromi; the service picks up the new build. Options, as
environment variables before `sh`: `SOROMI_VERSION=1.2.0` for a given release, `SOROMI_BIN_DIR`
for another folder, `SOROMI_NO_SETUP=1` to install only.

Agents are installed and logged in as usual. With no browser on the server, Claude Code shows a
link to open on your computer or phone and a code to paste back:

```bash
npm install -g @anthropic-ai/claude-code
claude          # then /login
```

## The service

```bash
soromi service status      # running?
soromi service logs        # what it says, as it says it
soromi service restart
soromi service uninstall   # stops it and takes it away; ~/.soromi stays
soromi service install     # back again (--direct keeps the route for a phone on the same network)
soromi status              # the daemon: what it runs on, how it was started, what is paired
```

The service runs the daemon through a login shell, so the agents are found where an SSH session
finds them (`~/.profile`, not `~/.bashrc`: a tool that only `~/.bashrc` puts on `PATH`, such as one
installed with nvm, needs that line in `~/.profile` too).

On a Mac the same commands use launchd instead, for a Mac that is kept on as a server; its log is
`~/.soromi/daemon.log`. There the desktop app, when it is opened, uses the service's daemon.

## Workspaces

The phone adds them too (the + on its home), or from the shell:

```bash
soromi add ~/code/my-app                  # the whole folder, with Claude Code
soromi add ~/code/api --agent codex       # another agent
soromi add ~/code/site --name website     # another name
soromi spaces                             # what is there
soromi remove website                     # take one out (its files stay)
```

A folder with a `soromi.space.json` is added as that file describes. Otherwise the folder is one
workspace running one agent, under the `personal` account (the one the desktop and the phone use
too): the server user's own login. An account
of another name must already exist in `~/.soromi/accounts`.

## Phones

```bash
soromi pair "My iPhone"     # or: soromi setup --pair
soromi devices
soromi revoke <id or name>
```

The app can be paired with several computers (your Mac, this server) and moves between them from
its home's title.

## Without the installer

To build it yourself instead (a machine with no release build, or to run your own changes), with
Rust from https://rustup.rs:

```bash
git clone https://github.com/soromi/soromi.git && cd soromi
cargo build --release -p soromi-daemon
install -m 755 target/release/soromi-daemon ~/.local/bin/soromi
soromi setup
```

## Settings

The daemon reads `~/.soromi/config.json` and these environment variables. The service sets
`SOROMI_LAUNCHER=service` and `SOROMI_DIRECT=0` (`1` with `service install --direct`).

| Variable | What it does |
|---|---|
| `SOROMI_PORT` | The local port the daemon listens on, loopback only (default `8317`). The other `soromi` commands find the running daemon by itself (it notes its port in `~/.soromi/daemon.json`); set it to reach a different one. |
| `SOROMI_DIRECT` | `0` turns off the direct route, which listens on the network for a phone that shares it. A cloud server has no such network; on a VPN the phone shares (Tailscale, WireGuard), keep it with `service install --direct`. |
| `SOROMI_DIRECT_PORT` | The direct route's port (default `8318`). |
| `SOROMI_RELAY_URL`, `SOROMI_RELAY_ACCESS_KEY` | A relay of your own instead of Soromi's. |
| `SOROMI_HOME` | Where the daemon keeps its state (default `~/.soromi`). |
| `SOROMI_LAUNCHER` | What started the daemon, which it tells every app that connects: `desktop` (the Soromi app sets it), `service` (the service sets it; systemd is also recognized on its own) or `cli`, the default. Apps can offer more or less depending on it. |
