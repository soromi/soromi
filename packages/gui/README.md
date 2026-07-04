# @soromi/gui

The desktop UI for Soromi, a viewport onto the daemon. It renders a workspace's terminal,
a read-only file tree and preview, and the controls around them. It holds no authority of
its own; the daemon owns all state.

## Layout

Three columns:

- **Rail:** workspace switcher with status and notification badges, plus Files and Settings.
- **Sidebar:** contextual. The read-only project tree across the active workspace's repos,
  or settings.
- **Content:** the active workspace's terminal (xterm.js, WebGL renderer with a DOM
  fallback) and a read-only, syntax-highlighted file preview.

React and Zustand drive the chrome. xterm instances live outside React's render cycle;
React never re-renders the terminal.

## Boundaries

- **Renders only from protocol messages.** No direct filesystem or PTY access. The tree,
  preview, and terminal output all arrive as `@soromi/protocol` messages.
- **Depends on `@soromi/protocol` only** (internally). Never imports `@soromi/daemon`.
- **Talks to the daemon through a `Transport` abstraction,** never a raw `WebSocket`, so
  transports are swappable.
- **Read-only.** No file editing, file operations, or cross-file search.
- **The performance budget is a feature.** Only the visible terminal renders; background
  workspaces are parked buffers.

## Structure

Organized by domain, not by technical type. Each feature owns its own components, hooks,
and store slice; only genuinely reusable pieces live in `shared/`.

```
src/
  main.tsx            mount point
  app/                application shell and layout (rail + sidebar + content)
  features/           one folder per product domain, each self-contained
    workspaces/       the rail: workspace switcher, badges, store
    terminal/         xterm pane and its header
    files/            read-only tree and file preview
    settings/         accounts, notifications, keep-awake
  services/           external access, no UI
    transport/        the Transport abstraction and its client
  shared/             cross-cutting, domain-agnostic
    ui/               reusable presentational primitives
    theme/            the single theme object
    hooks/            reusable hooks
```

Where things go:

- A component used by one feature lives in that feature, not in `shared/ui`.
- State that belongs to one domain is a store slice inside that feature; only
  cross-cutting state lives in a shared store.
- Anything that talks to the daemon goes through `services/transport`, never a raw socket
  in a component.
