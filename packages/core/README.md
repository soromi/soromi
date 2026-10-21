# @soromi/core

What every Soromi client shares, with no UI framework in it: the transport to the daemon, the store
that mirrors the daemon's state, and the pairing code a phone scans.

It runs unchanged in the desktop webview and in React Native, so it depends on neither React nor the
DOM. The desktop binds it to React in `@soromi/client`; the mobile app does the same in
`apps/mobile`.

- **Transport** (`src/transport`): a reconnecting WebSocket to the daemon, direct
  (`LocalWebSocketTransport`) or through the relay (`RelayTransport`, end-to-end encrypted).
- **Store** (`src/store`): `createClientStore()` holds what the daemon streams (workspaces,
  sessions, chat), and `applyServerMessage` routes each message into it.
- **Pairing** (`src/pairing`): reads the `soromi://pair#…` code the desktop shows as a QR.

## What the host has to provide

- `WebSocket`, `TextEncoder` / `TextDecoder` and `atob` as globals.
- `crypto.getRandomValues` as a global, for the relay link's session keys. React Native needs a
  polyfill for it.
- A client id (a stable id for the install), passed to the transport. Where it is stored is the
  host's business.
