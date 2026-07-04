# @soromi/protocol

The shared contract. The single source of truth for every type that crosses the
daemon/viewport boundary.

## Purpose

Zod schemas (and the types inferred from them) for:

- `workspace.json`, the committable workspace descriptor
- account profiles, named isolated per-provider config
- the WebSocket message envelopes exchanged between a viewport and the daemon
- the agent status enum (`thinking | done | blocked | waiting-input | idle`)

Zod is the source of truth: every schema exports both a validator and its inferred
TypeScript type. Validate at every boundary (WS ingress, file read); trust types only
after a parse.

## Boundaries

- **Depends on nothing internal.** Only `zod`. Every other package depends on this one;
  this one depends on none of them.
- **No IO, no side effects.** Pure schemas and types: no filesystem, no network, no
  `console`. Importing it must do nothing.
- **Transport-agnostic envelopes.** The message schemas carry no assumption about who the
  peer is. The same envelopes can travel a local socket or be wrapped as opaque E2EE blobs
  through a relay, unchanged. Don't add local-only fields (absolute paths, fs handles) to a
  message.

## Key files

| File                   | Contents                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `src/index.ts`         | public entry, re-exports everything in `schemas/`          |
| `schemas/status.ts`    | `StatusSchema` / `Status`                                  |
| `schemas/workspace.ts` | `WorkspaceSchema`, relative-path-only repo validation      |
| `schemas/account.ts`   | `AccountProfileSchema`, profiles by name, no secrets       |
| `schemas/messages.ts`  | client-to-daemon and daemon-to-client discriminated unions |
