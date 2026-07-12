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
