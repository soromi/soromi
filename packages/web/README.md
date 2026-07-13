# @soromi/web

The mobile web viewport (PWA): a phone-shaped UI for controlling running agents remotely.

It reuses the shared engine in [`@soromi/client`](../client) (the transport interface, the terminal
surface, and the daemon-mirrored store) and adds its own touch-first screens: a full-screen
terminal with a top bar, a scrollable tab strip, slide-over workspace and files/skills drawers,
and a special-keys bar above the on-screen keyboard.

The web app is a separate deployable from the desktop app: desktop code (Tauri) never enters this
bundle, and this app's screens are its own, not the desktop ones. Both apps sit on the same engine,
so the terminal, store, and protocol wiring are shared, not duplicated.

Data reaches the viewport through the `Transport` interface. A `MockTransport` provides canned
workspaces and an echo terminal so the UI runs standalone, with no daemon and no relay. The
relay-backed remote transport implements the same interface, so nothing above it changes.

## Choosing a transport

The transport is chosen from the URL query string:

- **No params:** the `MockTransport` (canned data), so the UI runs standalone.
- **`?relay=<url>&room=<id>`:** the `RelayTransport`, dialing that relay and room.
- **`&key=<base64>`:** a base64 32-byte key that end-to-end-encrypts the link (must match the
  daemon's key). Without it, the relay link is plaintext (development only).

These params are a manual override for development; normally the relay URL, room, and key come from
pairing a device, not the URL.

```bash
pnpm web        # dev server (Vite)
# standalone (mock):   http://localhost:1430
# through a relay:     http://localhost:1430/?relay=ws://localhost:8787&room=demo&key=<base64-32-byte>
```
