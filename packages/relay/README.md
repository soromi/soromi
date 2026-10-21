# @soromi/relay

A stateless, content-blind relay that lets the phone reach the desktop daemon when they are not on
the same network.

Both peers dial **out** to the relay (so there is no port-forwarding or NAT to configure) and are
matched by a secret **room id**. The relay cross-forwards their frames **verbatim**, it never parses
or stores them. The frames are end-to-end encrypted between the daemon and the phone, so the relay
only ever sees ciphertext; it holds no end-to-end keys and no data.

## Protocol

- Connect: `wss://<relay>/?room=<id>&role=<host|device>`. The room id is random and secret,
  delivered by the pairing QR. The daemon is the room's `host`; the paired phone is its `device`.
- A room holds one host and one device. A socket joining in a role that is taken **replaces** the
  one holding it (which is closed with `4002`), so a peer that reconnects never waits for its own
  dead socket to time out.
- A host must present the access key (`4003` otherwise). A device needs no key, but the room must
  have its host (`4004` otherwise). A missing room id is refused (`4000`).
- Any frame from one peer is forwarded to the other. A peer that stops draining its socket is
  dropped rather than buffered for; dead sockets are dropped by a heartbeat.
- Each peer is told the room's occupancy as a text frame, `{"__relay":"presence","peers":n}`.
- `GET /health` returns `ok` for uptime checks.

## Run

```bash
pnpm --filter @soromi/relay dev      # watch mode (tsx); uses the daemon's default key if none is set
pnpm --filter @soromi/relay build && RELAY_ACCESS_KEY=your-secret pnpm --filter @soromi/relay start
```

Environment:

- `PORT` sets the listen port (default `8787`).
- `RELAY_ACCESS_KEY` (**required**) is the shared secret a daemon must present (in the
  `x-soromi-access` header) to open a room. There is no built-in value: the relay refuses to start
  without it, so it is never gated by a secret you did not choose. Only the daemon holds it; a
  paired phone joins an existing room by id without it, so the key never rides in a pairing code.
  Set it empty (`RELAY_ACCESS_KEY=`) to run an open relay that anyone may open rooms on.

## Self-host (Docker)

The relay is a single stateless process, so any container host works. Every frame between the
daemon and the phone passes through it, so run it in a region close to where you use them: its
distance from the two is added to every keystroke.

Every release publishes a pre-built image to GitHub Container Registry:

```bash
docker run -d --restart unless-stopped -p 8787:8787 \
  -e RELAY_ACCESS_KEY=your-secret \
  ghcr.io/soromi/soromi-relay:latest
```

Or build it yourself from the repo root (the image is standalone, no monorepo tooling at runtime):

```bash
docker build -f packages/relay/Dockerfile -t soromi-relay .
docker run -d --restart unless-stopped -p 8787:8787 -e RELAY_ACCESS_KEY=your-secret soromi-relay
# PORT overrides the listen port:
docker run -d -e PORT=9000 -p 9000:9000 -e RELAY_ACCESS_KEY=your-secret soromi-relay
```

`GET /health` returns `ok` (used by the image's `HEALTHCHECK`).

**TLS.** The image itself serves plain `ws://`. In production put it behind a TLS-terminating
reverse proxy (Caddy, nginx, a cloud load balancer) that upgrades to `wss://` and forwards
WebSocket traffic, so both peers can dial `wss://relay.example.com`. The relay is stateless and
holds no data, so it scales horizontally as long as **both peers of a room land on the same
instance** (pin by the `room` query param, or run a single instance).

**Wiring it up.** Point the daemon at your relay: set its `SOROMI_RELAY_URL` (or Settings ->
Remote) to `wss://relay.example.com`. If you set a private `RELAY_ACCESS_KEY`, give the daemon the
same value in Settings -> Remote -> "Relay access key" (or `SOROMI_RELAY_ACCESS_KEY`). Paired
devices' QR codes then carry your relay URL (never the access key). See the
[daemon README](../../crates/daemon/README.md#pairing-endpoints-self-host-no-rebuild).
