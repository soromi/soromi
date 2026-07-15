# Changelog

All notable changes to Soromi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2026-07-15

### Added

Remote control (relay + mobile PWA):

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
- Mobile web viewport (`packages/web`): a touch-first PWA on the shared engine. Scanning the
  desktop's pairing QR (or pasting the link) connects it; installable, with an offline app-shell
  service worker.
- Self-host without a rebuild: the relay and web-viewport URLs are runtime config
  (`~/.soromi/config.json` or env vars), editable in Settings and applied live.

Plan usage:

- A bottom-bar Usage popup showing each active agent's rolling-window usage (Claude and Codex),
  read from their OAuth usage endpoints, with brand marks and colours, cached with a manual
  refresh and inline percentages on the bar. A signed-in account that can't read usage (missing
  scope) gets an actionable note instead.

Providers:

- All provider-specific logic (launch flags, login checks, event hooks, resume, skills, usage)
  consolidated behind a single `Provider` trait, one folder per provider, so adding an agent is a
  new folder plus one registry entry.

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

- Keep-awake moved to the rail; the notification control moved into Workspace Settings as a
  toggle; the top-right controls were removed, and tabs are more compact.
- Centralised the z-index scale in the theme so overlay, bar, and popover layering stays
  consistent.
- Clicking a macOS notification now focuses the app window.
- Daemon README documents the viewport model, relay configuration, and self-host endpoints.

### Fixed

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
