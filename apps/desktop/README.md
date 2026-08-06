# @soromi/desktop — Soromi desktop app (Electron)

The native desktop shell. It renders the shared frontend (`packages/gui`) and drives the Rust daemon
(`crates/daemon`). Built with Electron Forge + Vite + TypeScript.

## Architecture

The Electron main process is Node, so it can't run the Rust daemon in-process. Instead the shell
**spawns the standalone `soromi-daemon` binary as a child**, on a free port (`SOROMI_PORT`), and
connects the renderer to it over a WebSocket. Everything — sessions, agents, transcripts,
notifications, keep-awake, relay, pairing — lives in the daemon; the shell is a thin native host.

- **`src/main.ts`** — orchestration only; each concern is a module under `src/shell/`:
  - `daemon.ts` — spawns/owns the daemon (free port, login-shell PATH, readiness, teardown).
  - `window.ts` — the main window (macOS `hiddenInset` traffic lights, hide-on-close, drag regions).
  - `serve.ts` — serves the gui build over an `app://` scheme (dev: the gui dev server).
  - `ipc.ts` — the IPC handlers the renderer's host layer calls.
  - `notifications.ts` — native OS banners with the app identity + click-to-focus.
  - `single-instance.ts`, `lifecycle.ts`, `paths.ts` — the lock, the quit flag, path/env constants.
- **`src/preload.ts`** — exposes `window.__SOROMI_DAEMON_URL__` / `__SOROMI_VERSION__` and the
  `window.__SOROMI_ELECTRON__` bridge that `packages/gui/src/lib/host.ts` routes to.

Notifications and window focus are wired to the daemon over the protocol (`NotificationsNative`,
`SetFocused`, `Notify`), so agent banners carry the Soromi icon and are muted while the app is focused.

## Run it

```bash
# Build the daemon + gui, then launch (Forge dev).
pnpm --filter @soromi/desktop dev

# Or with gui hot-reload: run the gui dev server in one terminal…
pnpm --filter @soromi/gui dev
# …and the shell pointed at it in another:
pnpm --filter @soromi/desktop build:daemon
SOROMI_DEV=1 pnpm --filter @soromi/desktop start
```

## Build a bundle

```bash
pnpm --filter @soromi/desktop package   # -> apps/desktop/out/…/Soromi.app
pnpm --filter @soromi/desktop make      # installers (zip/deb/rpm/squirrel)
```

The release daemon and the gui dist are bundled into `Contents/Resources` (see `forge.config.ts`).
