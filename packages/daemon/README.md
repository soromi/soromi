# @soromi/daemon

The product core. **The daemon is the product; every UI is a viewport.**

## Purpose

A headless Node process that owns everything real and outlives every GUI:

- **PTY sessions** (`node-pty`): one terminal per workspace, spawned at the work-folder root
  with the whole multi-repo tree in reach. Terminals survive GUI close and machine lock;
  re-attach replays capped scrollback.
- **Account resolution:** given a profile name, produce the env and config-dir overrides
  that launch the agent under the right isolated account (`~/.soromi/accounts/<name>/`).
- **Status parsing:** turn PTY output into the status enum; drive rail badges.
- **Notifications:** OS-native, fired by the daemon (so alerts work with the GUI closed),
  transition-based and debounced.
- **Keep-awake:** `caffeinate` / `systemd-inhibit` / `SetThreadExecutionState` while agents
  run.
- **WebSocket server:** the one line viewports attach over; only visible data crosses it.

## Usage

Spaces are **created in the app** (pick a folder, choose an account and agent) and persisted
in `~/.soromi/spaces.json`, so they restore when the daemon restarts. The CLI just starts the
server; an optional directory argument imports that folder's `soromi.space.json`:

```bash
soromi              # start empty; restore persisted spaces; create more from the app
soromi [dir]        # also import dir/soromi.space.json into a persisted space
```

The daemon spawns each space's `agent` command at its work-folder root and serves it over
WebSocket.

A space's `account` may have a profile at `~/.soromi/accounts/<name>/profile.json`
(shape: `{ name, providers: { <provider>: { env, configDir } } }`). Its per-provider env
is layered over the launch environment to isolate the account; a missing profile is
non-fatal (runs under the default environment). `SOROMI_HOME` overrides the `~/.soromi`
root.

## Boundaries

- **Depends on `@soromi/protocol` only** (internally). Never imports `@soromi/gui`.
- **Sole state authority.** Viewports are stateless; they render what the daemon sends. A
  remote client is just another attach.
- **Transport seam.** Serve frames through a transport abstraction, not inline sockets, so
  an alternative transport slots in without touching daemon logic.
- **Organized by domain.** Sessions, accounts, status, notifications, and transport are
  separate modules, not one flat file.

## Key files

| Path                      | Contents                                                        |
| ------------------------- | --------------------------------------------------------------- |
| `index.ts`                | CLI entrypoint; restores spaces and starts the WS server        |
| `config.ts`               | daemon port constant                                            |
| `workspaces/`             | space service, local space store, `soromi.space.json` import, agent-command |
| `accounts/`               | account profile loader and launch-env resolution                |
| `sessions/`               | `Session` (node-pty), scrollback buffer, session manager        |
| `transport/`              | WebSocket server and per-connection message routing             |
| `status/`                 | PTY-output status parsing and per-session status state          |
| `notifications/`          | OS-native notifier and the debounced notification controller    |

## Not responsible for

Editing files, git automation, roles/kanban, in-app AI, analytics. The daemon does the
four hard things (PTY survival, account isolation, keep-awake, notifications) and nothing
else.
