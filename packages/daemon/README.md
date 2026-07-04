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

## Boundaries

- **Depends on `@soromi/protocol` only** (internally). Never imports `@soromi/gui`.
- **Sole state authority.** Viewports are stateless; they render what the daemon sends. A
  remote client is just another attach.
- **Transport seam.** Serve frames through a transport abstraction, not inline sockets, so
  an alternative transport slots in without touching daemon logic.
- **Organized by domain.** Sessions, accounts, status, notifications, and transport are
  separate modules, not one flat file.

## Key files

| File               | Contents                                                         |
| ------------------ | ---------------------------------------------------------------- |
| `index.ts`         | process entrypoint; wires the pieces above together              |
| `status-parser.ts` | heuristic mapping of PTY output to `Status`, pluggable per agent |

## Not responsible for

Editing files, git automation, roles/kanban, in-app AI, analytics. The daemon does the
four hard things (PTY survival, account isolation, keep-awake, notifications) and nothing
else.
