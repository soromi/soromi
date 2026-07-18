# Changelog

All notable changes to Soromi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-18

### Added

Remote control (relay + web app):

- Relay service (`packages/relay`): a content-blind WebSocket pipe that pairs a desktop daemon
  with a remote viewport through rooms, with heartbeat-based cleanup and live peer-presence
  signalling.
- Device pairing: per-device rooms and keys are minted when pairing a phone (shown as a QR),
  with a paired-devices list, revoke, and a live connection indicator (green when the phone is
  attached, offline otherwise).
- Relay dial-out from the daemon, so a remote viewport can reach it without opening local ports.
- End-to-end encryption on the relay link (XChaCha20-Poly1305): the relay only ever forwards
  ciphertext. Client-side `relay-crypto` handles key decoding, seal, and open.
- `RelayTransport` and a shared `WebSocketTransport` base in the client package, with
  encode/decode hooks so relay frames encrypt transparently; a frame codec shared by the local
  server and the relay link.
- Web viewport (`packages/web`): a PWA on the shared engine that is now fully responsive, a
  touch-first bottom-tab layout on a phone and the desktop's rail + sidebar + tabs + status-bar
  layout on a wide screen, chosen by screen size. Scanning the desktop's pairing QR (or pasting the
  link) connects it; installable, with an offline app-shell service worker.
- Read-only file viewer on the web: the same syntax-highlighted view as the desktop, opened from
  the web file tree.
- Relay access key: a shared secret the daemon presents (in a header, never in a pairing link) to
  create a relay room, so a self-hosted relay can be made private (`RELAY_ACCESS_KEY`, or Settings).
  The default lets public builds reach the hosted relay; a paired phone joins by room id without it.
- Self-host without a rebuild: the relay and web-viewport URLs are runtime config
  (`~/.soromi/config.json` or env vars), editable in Settings and applied live. A GitHub Action
  publishes the relay image to GHCR on each release.

Plan usage:

- A bottom-bar Usage popup showing each active agent's rolling-window usage (Claude and Codex),
  read from their OAuth usage endpoints, with brand marks and colours, cached with a manual
  refresh and inline percentages on the bar. A signed-in account that can't read usage (missing
  scope) gets an actionable note instead.

Providers:

- All provider-specific logic (launch flags, login checks, event hooks, resume, skills, usage)
  consolidated behind a single `Provider` trait, one folder per provider, so adding an agent is a
  new folder plus one registry entry.
- Grok Build as a provider: isolated per account (`GROK_HOME`), login detection, and a completion
  cue via its `Stop` hook.

Workspaces and UI:

- Live per-workspace and per-tab status driven by agent hooks, with an attention badge on the
  workspace switcher and a pulse on non-idle status dots.
- Bottom status bar: plan usage on the left, connected devices on the right.
- Rename a workspace and toggle its notifications from Workspace Settings (redesigned as a
  full-page screen).
- Slack-style, platform-aware keyboard shortcuts for switching workspaces.
- Startup splash, so the shell no longer flashes the empty state before the active workspace
  loads.
- The active workspace is remembered across restarts (falls back to the first if it is gone).

### Changed

- The shared, presentational viewport UI now lives in a new `@soromi/ui` package used by both the
  desktop and web apps (skills, file tree, session tabs, usage widget, code viewer, provider marks,
  the colour palette + Mantine theme), so the two never drift.
- Redesigned the web's Disconnected, Takeover, and Welcome screens to match the app.
- The built-in default relay + web URLs point at the hosted relay and web app.
- Keep-awake moved to the rail; the notification control moved into Workspace Settings as a
  toggle; the top-right controls were removed, and tabs are more compact.
- Centralised the z-index scale in the theme so overlay, bar, and popover layering stays
  consistent.
- Clicking a macOS notification now focuses the app window.
- Daemon README documents the viewport model, relay configuration, and self-host endpoints.

### Fixed

- Revoking a device now drops its relay link and returns terminal control to the desktop, instead
  of leaving the phone "in control" and the web still showing "Connected".
- The web detects the machine going away (via relay presence) and reconnects, instead of showing a
  stale "Connected"; a distinct full-screen Disconnected state replaces the empty shell.
- Resume only when the prior conversation actually exists on disk, so a new or unused tab (or a
  pruned conversation, or one from a since-changed working directory) starts fresh instead of
  erroring "No conversation found".
- Terminal status is no longer inferred from a fresh or resumed session's replayed output, so a
  transcript that mentions "done" no longer reads as Finished.
- "Needs review" no longer falsely flags already-finished workspaces on launch.
- Adding or removing a workspace's folders relaunches its tabs so agents pick up the new paths;
  fixed an empty file tree when expanding a folder.

## [0.0.2] - 2026-07-12

### Added

- Initial web remote UI (`packages/web`): a browser viewport for controlling sessions remotely.
- Session resume for Codex sessions.
- Watch folders: the file tree reacts to changes on disk.
- Resizable sidebar.

### Changed

- Performance improvements across the GUI.

## [0.0.1] - 2026-07-09

### Added

- Session resume for Claude sessions.

### Changed

- Updated readme and landing page.

## [0.0.0] - 2026-07-08

Initial release.

### Added

- Workspace and session manager: create spaces, run agent sessions inside them.
- Rust daemon that owns PTYs, workspaces, accounts, the file tree, and notifications, serving
  viewports over a WebSocket (replaced the initial Node-based daemon).
- Tauri desktop app with a status banner.
- Initial GUI layout: file preview, terminal control, and terminal panel.
- Multiple concurrent sessions per workspace.
- Provider accounts and overlay-based navigation.
- Notifications and agent hooks.
- Keep-awake agent and account handling.
- Work tree actions and per-workspace instructions.
- Transport layer separated from the GUI to prepare for remote control.
- Landing page with download section, captures, and analytics.
- Support for ignored files in the file tree.

### Fixed

- CI builds, including Linux and Windows packaging.
- Terminal scroll and rendering issues.
