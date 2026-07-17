# @soromi/relay

A stateless, content-blind relay that lets the phone reach the desktop daemon when they are not on
the same network.

Both peers dial **out** to the relay (so there is no port-forwarding or NAT to configure) and are
matched by a secret **room id**. The relay cross-forwards their frames **verbatim**, it never parses
or stores them. Today those frames are the protocol's JSON; next they are end-to-end-encrypted
blobs, so the relay only ever sees ciphertext. Security comes from the room id being secret and, in
the next phase, the frames being encrypted, the relay holds no keys and no data.

## Protocol

- Connect: `wss://<relay>/?room=<id>` (a random, secret id, later delivered by the pairing QR).
- The first two peers in a room are paired; a third is refused (`4001`), a missing room is refused
  (`4000`).
- Any frame from one peer is forwarded to the other. Dead sockets are dropped by a heartbeat.
- `GET /` (or `/health`) returns `ok` for uptime checks.

## Run

```bash
pnpm --filter @soromi/relay dev      # watch mode (tsx)
pnpm --filter @soromi/relay build && pnpm --filter @soromi/relay start
```

`PORT` sets the listen port (default `8787`).

## Self-host (Docker)

The relay is a single stateless process, so any container host works. Build from the repo root
(the image is standalone, no monorepo tooling at runtime):

```bash
docker build -f packages/relay/Dockerfile -t soromi-relay .
docker run -d --restart unless-stopped -p 8787:8787 soromi-relay
# PORT overrides the listen port:
docker run -d -e PORT=9000 -p 9000:9000 soromi-relay
```

`GET /health` returns `ok` (used by the image's `HEALTHCHECK`).

**TLS.** The image itself serves plain `ws://`. In production put it behind a TLS-terminating
reverse proxy (Caddy, nginx, a cloud load balancer) that upgrades to `wss://` and forwards
WebSocket traffic, so both peers can dial `wss://relay.example.com`. The relay is stateless and
holds no data, so it scales horizontally as long as **both peers of a room land on the same
instance** (pin by the `room` query param, or run a single instance).

**Wiring it up.** Point the daemon and the hosted web app at your relay: set the daemon's
`SOROMI_RELAY_URL` (or Settings -> Remote) to `wss://relay.example.com` and `SOROMI_WEB_URL` to
where you host the web viewport. Paired devices' QR links then carry your relay + web URLs. See the
[daemon README](../../crates/daemon/README.md#pairing-endpoints-self-host-no-rebuild).
