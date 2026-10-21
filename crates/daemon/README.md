# soromi-daemon

The daemon is the product; every UI is a viewport. It owns the PTYs, the workspaces, the account
resolution, the file tree (with a live watcher), notifications, and keep-awake, and serves them to
viewports over a WebSocket. Terminals survive a viewport disconnecting: the daemon keeps each one's
screen and scrollback and redraws them on re-attach.

Viewports connect two ways, both running the same message router:

- **Local:** a direct WebSocket on `localhost` (plaintext, trusted).
- **Relay:** the daemon dials out to a relay so a remote viewport (the phone) can reach it. Frames
  on this link are end-to-end encrypted (XChaCha20-Poly1305); the relay only ever forwards
  ciphertext.

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
| `SOROMI_RELAY_URL` | Relay base URL to dial, e.g. `wss://relay.example.com` or `ws://localhost:8787`. |
| `SOROMI_RELAY_ROOM` | Shared room id that pairs this daemon with one viewport. Keep it secret. |
| `SOROMI_RELAY_KEY` | Base64 32-byte secret the link's end-to-end encryption is keyed from. If unset, the relay link is plaintext (development only). An invalid key is refused rather than downgraded. |

The secret itself never encrypts a frame. When a device arrives it asks for a session, the device
and the daemon each contribute 32 random bytes, and two keys (one per direction) are derived from
the secret and both contributions with HKDF-SHA256. Frames are XChaCha20-Poly1305 with a counter
as the nonce, and a frame whose counter is not past the last one accepted is dropped. So a frame
recorded on the relay cannot be replayed, in its own session or a later one, nor sent back to the
side it came from.

The relay itself is a separate, content-blind process; see [`@soromi/relay`](../../packages/relay).

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
  on it (the desktop window reports its focus).
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
- A phone that is put away is pushed nothing while someone is looking at the app on this computer.
- What is pushed is the banner's text (the workspace's name and what happened) and the session's
  id. Unlike everything on the link it is not end-to-end encrypted: Expo, and Apple or Google
  after it, can read it. A device that registers no token is never pushed anything.

### Pairing endpoints (self-host, no rebuild)

The relay used when **pairing a phone** is runtime config, so a bundled app never needs a rebuild to
point at your own infrastructure. Each value resolves **config file → environment variable →
default**, and the desktop app edits the file from its Settings ("Remote").

| Key (`~/.soromi/config.json`) | Env var | Default | Purpose |
| --- | --- | --- | --- |
| `relayUrl` | `SOROMI_RELAY_URL` | `wss://relay.soromi.dev` | Relay both the daemon and paired phones dial. |
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
