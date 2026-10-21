# soromi-daemon

The daemon is the product; every UI is a viewport. It owns the PTYs, the workspaces, the account
resolution, the file tree (with a live watcher), notifications, and keep-awake, and serves them to
viewports over a WebSocket. Terminals survive a viewport disconnecting: the daemon keeps each one's
screen and scrollback and redraws them on re-attach.

Viewports connect two ways, both running the same message router:

- **Local:** a direct WebSocket on `localhost` (plaintext, trusted). Only a client holding the
  local token gets in (`transport/local.rs`): any account on the machine can reach the port, and
  so can a web page open in a browser on it, but the token is in `~/.soromi/daemon.json`, which
  only this user can read. The desktop app hands the daemon it starts one of its own
  (`SOROMI_LOCAL_TOKEN`); a daemon started otherwise makes one. Clients present it as `?token=`,
  and the `soromi` commands read it from `daemon.json`; one without it is refused with `401`.
- **Relay:** the daemon dials out to a relay so a remote viewport (the phone) can reach it. Frames
  on this link are end-to-end encrypted (XChaCha20-Poly1305); the relay only ever forwards
  ciphertext.

## Command line

`soromi` (or `soromi serve [dir]`) runs the daemon. The other commands are one-off clients of the
daemon already running on this machine, over the local link, for a machine with no desktop app
(see [`docs/server.md`](../../docs/server.md)): `pair` (prints the pairing QR code and waits for
the phone), `status`, `devices`, `revoke`, `spaces`, `add` and `remove`; `setup` sets a machine up
in one go, and `service install|uninstall|status|restart|logs` runs the daemon as a service (a
systemd user unit on Linux, a launchd agent on a Mac, both written from `src/cli/service.rs`).
`scripts/install.sh` downloads a release build and runs `setup`.

Every client is told, in the answer to its `hello`, which computer the daemon runs on and what
started it (`host.launcher`: `desktop`, `cli` or `service`, from `SOROMI_LAUNCHER` or systemd), so
an app can offer what makes sense for that kind of computer. `soromi help` lists them. They live
in `src/cli/`.

## Banners about tool requests

When a chat session waits on a tool request (`can_use_tool`), its banner says what is asked
("asks to use Bash: pnpm test") and carries the request's id (`WireNotification::approval`, sent
in `Notify` and in pushes, which also get the `approval` category the phone shows Allow and Deny
buttons for). `ChatApprovalResponse` is taken from any viewport, not only the one in control, so a
phone answers from a banner while the desktop holds control; the first answer wins. A pushed
banner also names the phone's device id, for a phone paired with several computers.

## One daemon to a home

A daemon holds an exclusive lock on `<SOROMI_HOME>/daemon.lock` while it runs and writes
`daemon.json` (its port, pid, version and launcher, readable by this user only) beside it
(`src/instance.rs`). The lock is the operating system's, in memory, so it goes with the process
however that ends; a `daemon.json` left by one that crashed or lost power is never believed,
because its lock is no longer held. The `soromi` commands find the daemon through it (the desktop
app picks its port at random), and a second daemon on the same home refuses to start, exiting with
code 3; the desktop app then uses the one running, and leaves it running when it quits. The daemon
keeps `SOROMI_LAUNCHER` out of the environment of the shells and agents it starts.

## Background agents' logs

A session lists the agents its agent runs in the background (`SubAgent`, with an `id`: the tool
call that started it). A viewport asks to follow one with `WatchAgent`; the daemon finds the
agent's own log through the provider (Claude keeps it beside the conversation, in
`<conversation>/subagents/agent-<id>.jsonl`, matched to the tool call by its `.meta.json`) and
streams `AgentLog`s: the latest 200 events, then each batch it adds
(`src/transport/agent_log.rs`). Pictures are left out and long tool output is cut, so a log fits
through the relay.

## Queued messages

A message sent while a chat's agent works steers the running turn (`ChatTurn`). One sent with
`ChatQueue` waits instead: the daemon holds each chat's queue (`src/sessions/queue.rs`), shows it
in the session's summary (`queued`, the start of each message, and `queuePaused`), and its chat
watcher sends the oldest as a turn of its own once a turn ends and the chat has stayed idle for a
moment (a message that steered the turn can come back as one of its own, and the queue waits for
it). Sent while the agent is idle, it goes at once. `ChatUnqueue` sends one now or drops it. A
stop (`ChatInterrupt`) holds the queue until the next turn is sent. Queues are kept in memory.

## Earlier conversations

`ListConversations` lists the conversations a workspace's agents kept on disk for it, newest first,
across every account the workspace binds; with a `query`, those that mention it, in their name or
in what was said (the files are read off the message loop, each line only parsed when it matches).
Claude keeps them in `<config>/projects/<folder>/<id>.jsonl`; one is named by the title it was given
or its first prompt, and says its last (`src/providers/claude/conversations.rs`).
`ResumeConversation` opens a tab on one, named after it: the agent is started with `--resume`, and
the tab's chat shows the history. A conversation a tab already shows is that tab.

## Configuration

All configuration is via environment variables. All are optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SOROMI_HOME` | `~/.soromi` | Config + state directory (accounts, spaces, socket). |
| `SOROMI_PORT` | built-in | Port for the local WebSocket server. |

### Relay (remote access, off by default)

Set these to also dial a relay, so a viewport that is not on the same machine can connect. Without
them the daemon binds `localhost` only. This is a manual override intended for self-hosting and
development; the room and key are otherwise generated per device when pairing a phone.

| Variable | Purpose |
| --- | --- |
| `SOROMI_RELAY_URL` | Relay base URL to dial, e.g. `wss://relay.example.com`, or `ws://localhost:8787` for `pnpm dev:relay`. |
| `SOROMI_RELAY_ROOM` | Shared room id that pairs this daemon with one viewport. Keep it secret. |
| `SOROMI_RELAY_KEY` | Base64 32-byte secret the link's end-to-end encryption is keyed from. If unset, the relay link is plaintext (development only). An invalid key is refused rather than downgraded. |

The secret itself never encrypts a frame. When a device arrives it asks for a session, the device
and the daemon each contribute 32 random bytes, and two keys (one per direction) are derived from
the secret and both contributions with HKDF-SHA256. Frames are XChaCha20-Poly1305 with a counter
as the nonce, and a frame whose counter is not past the last one accepted is dropped. So a frame
recorded on the relay cannot be replayed, in its own session or a later one, nor sent back to the
side it came from.

The relay itself is a content-blind Cloudflare Worker, one Durable Object per room; see
[`@soromi/relay`](../../packages/relay).

### Direct connections (same network, on by default)

A paired phone that shares a network with this computer (the same Wi-Fi, a VPN such as Tailscale)
connects to it straight, without the relay, and goes back to the relay when it leaves.

- The daemon listens on every interface, on the port below, **only while direct access is on and
  at least one device is paired**. With nothing paired no port is open.
- The link is the relay link's: the same end-to-end encrypted frames, keyed from the device's
  pairing secret. A socket must name a paired device to be let in (`/?device=<id>`), and is served
  nothing, and holds no control, until it sends a frame that opens with that device's key. One
  that has not within 10 seconds is dropped.
- The daemon tells each device where it can be reached (`Routes`: one `ws://<address>:<port>` per
  private or VPN address of this computer) when it connects and whenever that changes. The phone
  tries those addresses next to the relay and prefers one that answers.
- Control follows the device from one of its links to the next, so changing network does not cost
  it the session it was driving. A device that drops off while in control (out of range, or its
  app put behind another one, which cuts its connection) gets it back when it returns, however
  long after, unless someone else drove meanwhile: typed, sent a message, answered an approval, or
  took control. A viewport that was only on screen in between has not claimed anything.

| Config key | Env var | Default | Purpose |
|---|---|---|---|
| `direct` | `SOROMI_DIRECT` (`0`, `off`, `false` turn it off) | on | Whether paired devices may connect directly. The desktop's Settings ("Remote") has the switch. |
| n/a | `SOROMI_DIRECT_PORT` | `8318` | The port devices connect to. If it is taken, any free port is used and reported to devices. |

A firewall that blocks incoming connections to the daemon only costs the direct route: devices
keep using the relay.

### Sleep

A sleeping computer cannot be reached: the daemon is frozen with the rest of it, and no setting on
the phone changes that. What the daemon does about it:

- **It holds the machine awake while a paired device is connected**, by either route, whatever
  the keep-awake mode, and for 90 seconds after the last one leaves (a phone changing network is
  back within that). This is the system's own rule for a remote login session. The display still
  sleeps. A lid that is closed still puts the machine to sleep.
- **It notices a wake within a couple of seconds** (the wall clock has jumped past its own) and
  starts every link that leaves the machine afresh: the relay links are dialed again at once, and
  direct sockets from before are dropped. Without this it would trust dead sockets until its
  45-second silence limit ran out, and a laptop that wakes for a few seconds at a time and sleeps
  again, as they do on battery, would never be reachable in those windows.
- To be reachable at any time, with nobody connected, the machine must not sleep at all: keep-awake
  mode `always`.

### Banners on a paired device

The daemon decides when a banner is due (a task finished, an agent needs a permission or is waiting
for an answer) and a muted workspace sends none. A paired device that asks for them
(`notifications-native`) is sent each one as a `notify` message, beside whatever this computer
does with it:

- **This computer** shows the banner and plays the sound only while nobody is looking at the app
  on it (the desktop window reports its focus) and the person is not on a device: while a paired
  device drives the sessions, or did when its app was put away and nobody here has acted since
  (it is owed control back), the computer stays quiet, focused or not.
- **A device** is sent it either way. A focused window on the computer says nothing about where
  the person holding the phone is, and only the device knows whether its own screen is showing
  that session.

A device's app is cut off by its system soon after it leaves the screen, so over the link it only
hears of a banner while it is open. For the rest there is push (`notifications/push.rs`):

- A device gives the daemon a push token (`register-push`), kept in `~/.soromi/push.json` and
  dropped when the device is revoked or the push service says the token is gone.
- It says when its app leaves the screen (`set-focused`). From then on, and whenever it is not
  connected at all, a banner is handed to Expo's push service instead of sent over the link. Each
  banner goes one way, never both.
- A phone that is put away is pushed nothing while someone is looking at the app on this computer,
  unless the person is on a device (above): then it is pushed, however the app here is.
- A refusal from the push service is written to the daemon's stderr. The one to look for is
  `InvalidCredentials`: the app's push credentials (for Android, the Firebase service-account key,
  FCM V1) are not in its EAS project, and no banner reaches a phone of that platform.
- What is pushed is the banner's text (the workspace's name and what happened) and the session's
  id. Unlike everything on the link it is not end-to-end encrypted: Expo, and Apple or Google
  after it, can read it. A device that registers no token is never pushed anything.

### Pairing endpoints (your own relay, no rebuild)

The relay used when **pairing a phone** is runtime config, so a bundled app never needs a rebuild to
point at a relay of your own (the Worker in `packages/relay`, deployed to your Cloudflare account). Each value resolves **config file → environment variable →
default**, and the desktop app edits the file from its Settings ("Remote").

| Key (`~/.soromi/config.json`) | Env var | Default | Purpose |
| --- | --- | --- | --- |
| `relayUrl` | `SOROMI_RELAY_URL` | `wss://relay-worker.soromi.dev` | Relay both the daemon and paired phones dial. |
| `accessKey` | `SOROMI_RELAY_ACCESS_KEY` | `soromi` | Secret the daemon presents to the relay to create a room. |

Pairing a device produces a code, shown as a QR, of the form `soromi://pair#<base64url(JSON)>`. The
JSON holds the code's version, the device id, the relay URL, the room, and the end-to-end key; the
relay access key is never part of it.

Example `~/.soromi/config.json`:

```json
{ "relayUrl": "wss://relay.example.com", "accessKey": "a-long-random-secret" }
```

An empty value falls back to the env var, then the default. Settings shows only what you set: a
field you never touched is empty, with the default it falls back to shown in its place, and a value
that just repeats the default is not stored (so you follow the default if it ever moves). Changes
made from Settings apply live (existing device links re-dial the new relay); editing the file
directly takes effect on restart.
