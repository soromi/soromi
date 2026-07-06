# @soromi/protocol

The shared contract for the TypeScript side: every type that crosses the daemon/viewport
boundary.

## Purpose

TypeScript types for:

- `soromi.space.json`, the committable workspace descriptor
- account profiles, named isolated per-provider config
- the WebSocket message envelopes exchanged between a viewport and the daemon
- the agent status enum (`thinking | done | blocked | waiting-input | idle`)
- workspace, session, and skill summaries

## Source of truth

These types are **generated from the Rust crate `crates/protocol`** with
[ts-rs](https://github.com/Aleph-Alpha/ts-rs); the Rust serde definitions are the single source
of truth. The generated files live in `src/generated/` and must not be edited by hand.
Regenerate after changing the Rust protocol:

```bash
pnpm gen:protocol
```

There is no runtime validation here (no zod). The GUI parses the JSON and trusts the generated
types; the Rust crate's wire-conformance tests pin the exact JSON shape so the two never drift.

## Boundaries

- **Depends on nothing internal.** Pure types; every other package depends on this one, this one
  depends on none of them.
- **No IO, no side effects.** Types only: no filesystem, no network, no `console`. Importing it
  must do nothing.
- **Transport-agnostic envelopes.** The messages carry no assumption about who the peer is. The
  same envelopes can travel a local socket or be wrapped as opaque blobs through a relay,
  unchanged. Don't add local-only fields (absolute paths, fs handles) to a message.

## Key files

| File                 | Contents                                                     |
| -------------------- | ------------------------------------------------------------ |
| `src/index.ts`       | public entry, re-exports the generated types                 |
| `src/generated/*.ts` | ts-rs output from `crates/protocol` (generated, do not edit) |
