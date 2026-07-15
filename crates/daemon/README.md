# soromi-daemon

The daemon is the product; every UI is a viewport. It owns the PTYs, the workspaces, the account
resolution, the file tree (with a live watcher), notifications, and keep-awake, and serves them to
viewports over a WebSocket. Terminals survive a viewport disconnecting and replay their scrollback
on re-attach.

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
| `SOROMI_RELAY_KEY` | Base64 32-byte key that end-to-end-encrypts the link. If unset, the relay link is plaintext (development only). An invalid key is refused rather than downgraded. |

The relay itself is a separate, content-blind process; see [`@soromi/relay`](../../packages/relay).

### Pairing endpoints (self-host, no rebuild)

The relay and hosted web-viewport URLs used when **pairing a phone** are runtime config, so a bundled
app never needs a rebuild to point at your own infrastructure. They resolve **config file →
environment variable → default**, and the desktop app edits the file from its Settings ("Remote").

| Key (`~/.soromi/config.json`) | Env var | Default | Purpose |
| --- | --- | --- | --- |
| `relayUrl` | `SOROMI_RELAY_URL` | `ws://localhost:8787` | Relay both the daemon and paired phones dial. |
| `webUrl` | `SOROMI_WEB_URL` | `http://localhost:1430` | Base URL the pairing QR opens (where the web viewport is hosted). |

Example `~/.soromi/config.json`:

```json
{ "relayUrl": "wss://relay.example.com", "webUrl": "https://app.example.com" }
```

An empty value falls back to the env var, then the default. Changes made from Settings apply live
(existing device links re-dial the new relay); editing the file directly takes effect on restart.
