# Soromi

_From Japanese 揃う (sorou), to be gathered, aligned, complete as a set._

A small, fast, open-source home for AI coding agents. Each work folder, with all its
repos, gets one terminal, one agent, and the right account. Switch between them like
Slack workspaces.

Project rules and conventions live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Monorepo layout

```
packages/
  protocol/   shared Zod schemas + types (workspace.json, accounts, WS messages, status)
  daemon/     Node daemon: PTY sessions, account resolution, status parser, WS server
  gui/        React + Zustand + xterm.js viewport (browser tab at localhost for v1)
```

The `relay` package (remote PWA transport, E2EE) is deliberately the **last** feature; see
the workplan. The protocol envelopes are transport-agnostic so it slots in without a
rewrite.

## Development

Requires Node 22+ and pnpm 10.

```bash
pnpm install       # install all workspace deps
pnpm build         # build every package (turbo)
pnpm test          # run the vitest suite
pnpm typecheck     # type-check every package
pnpm lint          # lint with biome
pnpm format        # format with biome
pnpm dev           # run package dev servers
```

## License

MIT, see [LICENSE](./LICENSE).
