# @soromi/relay

The relay that lets a phone reach its computer when the two are not on the same network, as a
Cloudflare Worker.

Both ends dial **out** to it (nothing to forward on a router, no port open on the computer) and
meet in a **room**, by a random secret id the pairing QR carries. The relay forwards their frames
to each other **verbatim**: they are end-to-end encrypted between the daemon and the phone, so it
only ever sees ciphertext. It holds no keys and stores nothing.

Each room is a Durable Object. Cloudflare creates it near the first peer to reach it, which is the
daemon (it waits in its rooms), and each peer connects through its own nearest Cloudflare
location. So the relay runs close to whoever uses it, wherever that is, from one deployment. A
room's sockets use the hibernation API: while the phone is away and the daemon only waits, the
room is asleep and costs nothing.

## Protocol

- `wss://<relay>/?room=<id>&role=<host|device>`. The daemon is a room's `host`, the paired phone
  its `device`. A room holds one of each; their frames are forwarded to each other as they came,
  text as text and binary as binary.
- A socket joining in a role that is taken **replaces** the one there, which is closed with `4002`,
  so a peer that reconnects never waits for its own dead socket.
- A host must present the access key in the `x-soromi-access` header (`4003` otherwise). A device
  needs none, but the room must have its host (`4004`). A missing or overlong room id is refused
  (`4000`). A peer that names no role (an older build) is a host if it holds the key.
- Each peer is told the room's occupancy as a text frame, `{"__relay":"presence","peers":n}`.
- `GET /health` answers `ok`, or `503` while no access key is set. Anything else is `404`.

A Worker cannot send WebSocket pings. A dead socket is dropped when its connection times out, or
replaced when its peer comes back; the daemon and the phone notice a silent link on their own.

## Code

```
src/
├─ index.ts              the Worker: routes a request to its controller, exports the Room class
├─ types.ts              Role, Seat, Env (the bindings and the access-key secret)
├─ config/app.ts         the header names, limits and close codes
├─ controllers/
│  ├─ health-controller.ts   GET /health
│  └─ relay-controller.ts    the WebSocket route: decides room and role, hands the socket over
├─ rooms/
│  ├─ room.ts            the Durable Object: seats, forwarding, presence (hibernation API)
│  └─ seats.ts           what a room says and where a frame goes: pure, unit-tested
├─ helpers/
│  ├─ peer.ts            who a peer is: its room, its role, whether it may open a room (pure)
│  └─ refuse.ts          turning a peer away with a close code
└─ test/
   ├─ harness.ts         starts the Worker with `wrangler dev`; sockets as the daemon and phone
   └─ relay.test.ts      the protocol above, end to end
```

What can be tested without the Workers runtime (`helpers/peer`, `rooms/seats`) is kept in modules
of its own, with its tests beside it; those run in the repository's `pnpm test`. `test/` runs the
Worker itself, which takes a few seconds to start, so it runs on its own (below).

## Develop

```bash
pnpm dev:relay                          # wrangler dev, on ws://localhost:8787
pnpm --filter @soromi/relay test        # unit tests, then the Worker end to end
pnpm --filter @soromi/relay typecheck
```

`dev` needs an access key: put `RELAY_ACCESS_KEY=<anything>` in a `.dev.vars` file in this folder
(it is not committed). Point a daemon at it with `SOROMI_RELAY_URL=ws://localhost:8787` and
`SOROMI_RELAY_ACCESS_KEY=<the same>`.

## Deploy

With a Cloudflare account, from this folder:

```bash
npx wrangler login                        # opens the browser once
npx wrangler secret put RELAY_ACCESS_KEY  # the secret your daemons present; see below
pnpm deploy:relay                         # from the repository root (wrangler deploy)
```

The deploy prints the Worker's address, `https://soromi-relay.<your-subdomain>.workers.dev`; the
relay URL is the same with `wss://`.

**The access key.** Only a daemon that presents it can open a room, which keeps others from
running their traffic through your account. A daemon with nothing set presents `soromi`, which
anyone can read in this repository, so choose your own and give the same value to the Worker
(`wrangler secret put`) and to each daemon (Settings → Remote → "Relay access key"). An empty
secret leaves the relay open to anyone; with none set, it turns every daemon away.

**Pointing Soromi at it.** Set the relay URL in Settings → Remote. A pairing code carries the
relay it was made with, so a phone paired before the change still dials the old one: pair it again
(Devices → Pair a phone).

**On your own hostname** (`wss://relay.example.com`), in place of the `workers.dev` one: the
hostname's zone has to be on Cloudflare (its nameservers). Uncomment `routes` in `wrangler.jsonc`
with the hostname and deploy again; Cloudflare makes the DNS record and the certificate. Moving the
hostname phones were paired with to the Worker this way keeps them working without pairing again.

**Cost.** Durable Objects with hibernating WebSockets are on Cloudflare's free Workers plan, with
daily limits; one person's use is expected to fit. The usage is in the Cloudflare dashboard.
