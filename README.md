<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.png" />
    <img src="assets/logo-dark.png" alt="Soromi" width="240" />
  </picture>
</h1>

<p align="center">
  <strong>A small, fast, open-source home for AI coding agents.</strong><br />
  One place for your folders, your terminal, and the right account, per project.
</p>

<p align="center">
  <a href="#download">Download</a> &nbsp;&middot;&nbsp;
  <a href="#features">Features</a> &nbsp;&middot;&nbsp;
  <a href="#remote-access">Remote access</a> &nbsp;&middot;&nbsp;
  <a href="#architecture">Architecture</a> &nbsp;&middot;&nbsp;
  <a href="#development">Development</a>
</p>

<br />

<p align="center">
 <a href="https://www.producthunt.com/products/soromi?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-soromi" target="_blank" rel="noopener noreferrer"><img alt="Soromi - A small, fast home for AI coding agents | Product Hunt" width="150" height="32" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1191241&amp;theme=light&amp;t=1783600141858"></a>
</p>

<p align="center">
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/soromi/soromi?style=flat-square">
  <a href="https://github.com/soromi/soromi/releases"><img alt="GitHub Downloads (all assets, latest release)" src="https://img.shields.io/github/downloads/soromi/soromi/total?style=flat-square"></a>
  <img alt="GitHub License" src="https://img.shields.io/github/license/soromi/soromi?style=flat-square">
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square&color=555" alt="Supported platforms: macOS, Windows, and Linux" />
</p>

## What is Soromi?

Each work folder, with all its repos, gets a terminal, an agent, and the right account. Switch
between them like Slack workspaces.

The daemon owns the terminals, so your agents keep running when you close the window. The GUI,
whether the desktop app or the browser from your phone, is just a viewport onto them.

## Download

Grab the latest build for your platform from the
[releases page](https://github.com/soromi/soromi/releases/latest):

- **macOS:** the universal `.dmg` (Apple Silicon and Intel)
- **Windows:** the `-setup.exe` installer (or the `.msi`)
- **Linux:** the `.AppImage` (or the `.deb` / `.rpm` packages)

> **Note:** macOS builds are not notarized. On first launch, open System Settings >
> Privacy & Security and click "Open Anyway" (or right-click Soromi and choose Open).
> Soon the builds will be signed with an Apple developer account.

### Workspaces &amp; terminals

- **A workspace for every project.** Point Soromi at a folder and it becomes a workspace with
  its own terminal. Jump between projects like switching Slack workspaces.
- **Terminals that stay alive.** Close the window and your agents keep working. Reopen and pick
  up exactly where you left off.
- **Multiple tabs per workspace.** Run several agents side by side in one project, name them, and
  they come back after a restart.

### Focus &amp; context

- **Keep your accounts separate.** Give each agent its own login (work, personal, client) so they
  never mix.
- **Work on just the folders you choose.** Select the repos or folders that matter and the agent
  stays focused on them.
- **Browse files without leaving.** A read-only file tree and preview for quick reference; your
  real editor stays your editor.
- **Skills at a click.** See your agent's commands and skills in a sidebar and drop one into the
  terminal.

### Stay in the loop

- **Know when it needs you.** A sound and a notification when an agent asks for permission or
  finishes, so you can step away. Mute any workspace you want.
- **Stay awake while it works.** Optionally keep your machine from sleeping until the agent is
  done.
- **Know when there's a new version.** Soromi checks for newer releases and shows a quiet banner
  with a link to download. Nothing installs behind your back.

### Portable &amp; self-contained

- **Shareable setup.** Export a workspace to a small file anyone can import, or start fresh with
  no file at all.
- **Reach it from anywhere.** Open the same live terminal from your phone's browser. See
  [Remote access](#remote-access).
- **One app, nothing to wire up.** Everything runs from a single desktop app.

## Screenshots

<table>
  <tr>
    <td><img src="assets/soromi-1.jpg" width="200" alt="Soromi" /></td>
    <td><img src="assets/soromi-2.jpg" width="200" alt="Soromi" /></td>
    <td><img src="assets/soromi-3.jpg" width="200" alt="Soromi" /></td>
    <td><img src="assets/soromi-4.jpg" width="200" alt="Soromi" /></td>
  </tr>
  <tr>
    <td><img src="assets/soromi-5.jpg" width="200" alt="Soromi" /></td>
    <td><img src="assets/soromir-6.jpg" width="200" alt="Soromi" /></td>
    <td><img src="assets/soromi-noti.jpg" width="200" alt="Soromi notifications" /></td>
    <td></td>
  </tr>
</table>

## Remote access

The daemon owns the terminals, so any viewport that speaks the protocol can attach, including
a browser. Open Soromi from your phone or another machine and get the same live session: watch the
output stream, type into it, run a skill, and answer permission prompts with a tap.

Control is exclusive and hands off cleanly. Move to the desktop app and it takes over; come back to
the web client and it asks to take control again, so two devices never fight over the same terminal.
The web viewport is responsive: a full sidebar-and-tabs layout on desktop, and a bottom-tab layout
tuned for touch on mobile.

### Secure by design

Remote access is off until you pair a device, and even then the link is built so nothing in the
middle can read your session:

- **🔒 End-to-end encrypted.** Frames on the relay link are sealed with XChaCha20-Poly1305. The
  relay is a content-blind pipe that only ever forwards ciphertext, so it never sees your terminal,
  keystrokes, or output.
- **🚪 No open ports.** The daemon *dials out* to the relay; it never listens for inbound
  connections. Nothing on your machine is exposed to the internet, so there's no port to scan or
  firewall to open.
- **🎟️ Relay access key never leaves the daemon.** The relay is gated by an access key so randoms
  can't abuse it, but that key lives only in the daemon (config / `SOROMI_RELAY_ACCESS_KEY` /
  Settings) and is sent as a WebSocket header when dialing, never in a URL. Only the daemon can
  *create* a room; the web viewport only ever *joins* an existing one with the room id. So the key
  never rides along in the pairing link, browser history, or logs, and a URL leak can't expose it.
- **📱 Per-device keys, revocable.** Pairing a phone (via QR) mints that device its own relay room
  and end-to-end key. Each paired device shows a live connection indicator, and you can revoke any
  of them at any time from the paired-devices list. Rooms are strictly two-peer: even if a room id
  leaked, an attacker would grab a slot at worst (a revocable nuisance) and still see nothing,
  because the session is end-to-end encrypted.
- **🔑 No downgrade.** An invalid or missing key is refused rather than silently falling back to
  plaintext. Plaintext relay exists only for local development.
- **🏠 Self-hostable.** Point the relay and web-viewport URLs at your own infrastructure from
  Settings (or `~/.soromi/config.json`), no rebuild required. The relay is a small, separate,
  content-blind service you can run yourself; public builds create rooms on the public relay with
  zero config, while self-hosters set their own access key on the relay and in Settings.

## Why?

I built Soromi because I was tired of juggling a separate editor window for every project and
wrestling my agents into the right context. Setup was manual and fiddly, and I kept worrying
about mixing up accounts that were meant for different things.

I just wanted one place: the folders, the skills, and the terminal together, so I could jump
between projects, get a nudge when an agent needs me, keep the machine awake while it works, and
eventually glance at what it is doing from my phone.

The tools I tried were often heavier than I wanted or did far more than I needed, and left me
more confused than productive. So Soromi stays small and gets out of the way.

## Providers

A provider is a coding-agent CLI Soromi can run, isolate per account, and listen to. Adding one
is a small entry in the provider registry (`crates/daemon/src/config.rs`).

<table>
  <thead>
    <tr>
      <th align="left" width="190">Provider</th>
      <th align="left">🔐 Account&nbsp;isolation</th>
      <th align="left">🔔 Event&nbsp;cues</th>
      <th align="left">📁 Folder&nbsp;scoping</th>
      <th align="left">⚡ Skills</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><img src="https://unpkg.com/@lobehub/icons-static-png@latest/dark/claude-color.png" width="16" align="top" alt="" />&nbsp; <strong>Claude&nbsp;Code</strong></td>
      <td align="left">[✅] <code>CLAUDE_CONFIG_DIR</code></td>
      <td align="left">[✅] <code>settings.json</code> hooks</td>
      <td align="left">[✅] <code>--add-dir</code></td>
      <td align="left">[✅] commands + skills</td>
    </tr>
    <tr>
      <td><img src="https://unpkg.com/@lobehub/icons-static-png@latest/dark/openai.png" width="16" align="top" alt="" />&nbsp; <strong>Codex</strong></td>
      <td align="left">[✅] <code>CODEX_HOME</code></td>
      <td align="left">[☑️] done + <code>/hooks</code></td>
      <td align="left">[➖] first folder</td>
      <td align="left">[✅] prompts + skills</td>
    </tr>
    <tr>
      <td><img src="https://unpkg.com/@lobehub/icons-static-png@latest/dark/grok.png" width="16" align="top" alt="" />&nbsp; <strong>Grok&nbsp;Build</strong></td>
      <td align="left">[✅] <code>GROK_HOME</code></td>
      <td align="left">[☑️] <code>Stop</code> hook</td>
      <td align="left">[➖] first folder</td>
      <td align="left">[➖] not yet wired</td>
    </tr>
  </tbody>
</table>

<sub>✅ full support &nbsp;·&nbsp; ☑️ partial, needs a trusted hook &nbsp;·&nbsp; ➖ not applicable</sub>

Notes:

- **Account isolation** points each account at its own config directory, so multiple logins
  (work, personal, client) stay separate. Accounts are referenced by name; no secrets are stored
  in `soromi.space.json`.
- **Event cues** are driven by the agent's own hook events, not terminal parsing, so they are
  robust across CLI versions. Sounds play with no OS permission; native notifications may prompt
  for permission once.

## Architecture

Soromi is one idea repeated everywhere: **the daemon is the product, and every UI is just a
viewport onto it.** The daemon owns all state (PTYs, workspaces, accounts, the file tree,
notifications); viewports are stateless and interchangeable. The same protocol runs over a trusted
local socket or an end-to-end-encrypted relay, so your phone's browser and the desktop app are the
exact same client, just a different transport.

```
          VIEWPORTS (stateless)
    ┌───────────────┐     ┌───────────────┐
    │  Desktop GUI  │     │    Web PWA    │     React + Zustand + xterm.js
    │    (Tauri)    │     │    (phone)    │     render from messages, send input
    └───────┬───────┘     └───────┬───────┘
            │ local WS            │ relay WS (E2EE)
            │ (localhost)         │ XChaCha20-Poly1305
            │                     │
            │             ┌───────┴───────┐
            │             │     Relay     │     content-blind pipe
            │             │               │     (forwards ciphertext)
            │             └───────┬───────┘
            │                     │ dial-out, no open ports
    ┌───────┴─────────────────────┴─────────┐
    │             DAEMON (Rust)             │   sole state authority
    │   PTYs · workspaces · accounts        │   one WebSocket protocol
    │   file tree · status · hooks          │   (single source of truth)
    └───────────────────┬───────────────────┘
                        │ spawn + isolate + listen
    ┌───────────────────┴───────────────────┐
    │        PROVIDERS (agent CLIs)         │   one folder + one registry
    │    Claude Code · Codex · Grok · …     │   entry per provider
    └───────────────────────────────────────┘
```

**Principles that hold the design together:**

- **The daemon is the sole state authority.** Viewports never hold authoritative state; they render
  what the daemon sends and forward input and resize. Any viewport can drop and reattach, and
  terminals replay their scrollback.
- **Local and remote are the same client.** The transport is swappable (local WS vs. E2EE relay);
  everything above it is identical, so a feature works everywhere the moment it works once.
- **The protocol is defined once.** The wire types live in Rust (`crates/protocol`) and the
  TypeScript types are generated from them, so the two sides can never drift.
- **Providers are pluggable.** All provider-specific logic (launch flags, login checks, event
  hooks, resume, skills, usage) sits behind a single `Provider` trait, so adding an agent is a new
  folder plus one registry entry.

## How it works

- The **daemon** (Rust) owns every PTY, resolves accounts into launch environments, watches
  agent status, installs the agent event hooks, checks for newer releases, and speaks a small
  WebSocket protocol.
- The **GUI** (React + Zustand + xterm.js) is a pure viewport: it renders from protocol messages
  and sends input and resize. It holds no state authority of its own.
- The **protocol** is defined once in Rust (`crates/protocol`) and the TypeScript types are
  generated from it with [ts-rs](https://github.com/Aleph-Alpha/ts-rs), so the two never drift.
- The **desktop app** (Tauri) hosts the GUI in a webview and runs the daemon in-process on a
  local socket. The transport is kept deliberately simple so the same viewport can run remotely.

## Monorepo layout

```
crates/
  protocol/   Rust: the wire protocol (serde types), the single source of truth
  daemon/     Rust: PTY sessions, account resolution, status, agent hooks, WS server
packages/
  protocol/   TypeScript types generated from crates/protocol (do not edit by hand)
  client/     Shared viewport engine + transports (local WS, E2EE relay)
  relay/      Content-blind WebSocket relay that pairs a daemon with a remote viewport
  gui/        React + Zustand + xterm.js viewport (runs in the desktop app's webview)
  web/        Touch-first PWA viewport for the phone/browser, on the shared engine
apps/
  desktop/    Tauri 2 app that runs the daemon in-process
```

Each package and crate has a README describing its boundaries.

## Development

Requires **Node 22+**, **pnpm 10**, and a stable **Rust** toolchain.

```bash
pnpm install         # install workspace deps
pnpm build           # build every package + the desktop bundle (turbo)
pnpm typecheck       # type-check the TypeScript packages
pnpm lint            # lint with biome
pnpm test            # run the vitest suite
pnpm gen:protocol    # regenerate the TypeScript protocol types from the Rust crate
```

The Rust crates have their own gate:

```bash
cargo fmt --check
cargo clippy --all-targets
cargo test
```

Run it:

```bash
pnpm desktop         # the full app (Tauri dev)
```

Or iterate on the two processes separately:

```bash
pnpm daemon          # the Rust daemon (serves the local WebSocket)
pnpm dev             # the GUI dev server against that daemon
```

Project rules and conventions live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT, see [LICENSE](./LICENSE).
