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

Normally those params are not typed by hand: pairing a device in the desktop app produces a QR whose
link is `<webUrl>/?relay=…&room=…&key=…`. Scanning it with the phone's camera opens this app already
paired. The connect screen's paste field is the manual fallback for that same link.

```bash
pnpm web        # dev server (Vite)
# standalone (mock):   http://localhost:1430
# through a relay:     http://localhost:1430/?relay=ws://localhost:8787&room=demo&key=<base64-32-byte>
```

## PWA / deploy

The build (`pnpm --filter @soromi/web build`) emits a static bundle in `dist/` plus a service worker
(`vite-plugin-pwa`, Workbox) that precaches the app shell for offline launch and installability. It
is a plain static site: host `dist/` anywhere (any static host / CDN), then point the daemon's
`SOROMI_WEB_URL` at that origin so paired devices' QR links resolve to it. The web app talks only to
the relay (`SOROMI_RELAY_URL`), never to the daemon directly.

To serve it yourself, `pnpm --filter @soromi/web serve` runs a small Express static server (`server.mjs`,
SPA fallback + PWA-aware cache headers) on `PORT` (default `8080`).

## Docker image

Each release publishes an image to GHCR (`.github/workflows/web-image.yml`). Pull and run it, or
build it locally from the repo root:

```bash
docker run -p 8080:8080 ghcr.io/soromi/soromi-web:latest
# or build it: docker build -f packages/web/Dockerfile -t soromi-web .
```

The image is fully static and host-agnostic (the relay lives in each pairing link), so there is
nothing to configure; override the listen port with `-e PORT=…`.
