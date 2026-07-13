# Changelog

All notable changes to Soromi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Relay service (`packages/relay`): a content-blind WebSocket pipe that pairs a desktop daemon
  with a remote viewport through rooms, with heartbeat-based cleanup.
- Device pairing in the daemon: per-device rooms and keys are generated when pairing a phone,
  with a `DeviceSummary` protocol type to list paired devices.
- Relay dial-out from the daemon: the daemon connects out to a relay so a remote viewport can
  reach it without opening local ports.
- End-to-end encryption on the relay link (XChaCha20-Poly1305): the relay only ever forwards
  ciphertext. Client-side `relay-crypto` handles key decoding, seal, and open.
- `RelayTransport` and a shared `WebSocketTransport` base in the client package, with
  encode/decode hooks so relay frames can be encrypted transparently.
- Frame codec in the daemon transport shared by the local server and the relay link.
- Daemon README documenting the viewport model and relay configuration.

### Changed

- Workspace settings, sidebar, settings, and terminal deck UI updated for device pairing and
  remote access management.
- Web remote app selects its transport from the relay parameters (relay URL, room, key).

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
