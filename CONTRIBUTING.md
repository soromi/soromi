# Contributing to Soromi

Rules that hold across the whole project. They exist to keep the codebase small, fast, and
boring, the same qualities the product promises. If a rule here conflicts with a clever
idea, the rule wins until we consciously change the rule.

Read alongside each package's `README.md` (what that package is for).

---

## 1. Architecture rules

1. **The daemon is the product; every UI is a viewport.** Real state and work live in the
   daemon. UIs render what the daemon sends and send back input, nothing more.
2. **`@soromi/protocol` is the only shared contract.** Dependency direction is strict:
   - `daemon` depends on `protocol`
   - `gui` depends on `protocol`
   - `daemon` and `gui` never import each other. No cycles, ever.
3. **Organize by domain, not by technical type.** Group code by what it does in the product
   (sessions, accounts, status, notifications, transport), not by generic buckets like
   `utils` or `helpers`. Keep the layers separate: domain logic never reaches into transport
   or serialization, and vice versa. A file has one responsibility at one level.
4. **Viewports render only from protocol messages.** No direct filesystem or PTY access in
   the GUI. Tree, preview, and terminal output all arrive as messages. This is what lets the
   PWA reuse the viewport verbatim.
5. **Transport is an abstraction, not a raw socket.** Talk through a `Transport` interface so
   local (WS) and remote (E2EE-through-relay) are swappable. See the workplan's
   "Remote-ready seams" and honor all six even though remote is built last.
6. **The daemon is the sole state authority.** Viewports are stateless; a remote client is
   just another attach.
7. **Non-goals are load-bearing.** Roles, kanban, prompt libraries, token dashboards, git
   automation, file editing/ops/search, in-app AI, native mobile apps. If a change adds one,
   the answer is no. See the workplan's Guardrails.
8. **The performance budget is a feature.** Idle 5 workspaces at or under ~1% CPU and
   ~150 MB; only the visible terminal renders. If a change breaks the budget, it loses.

---

## 2. Code rules

- **TypeScript strict, everywhere.** No `any`; use `unknown` and narrow. Avoid non-null `!`;
  prefer an explicit check (as in `main.tsx`).
- **Zod is the source of truth for boundary data.** Validate at every boundary (WS ingress,
  file reads). Infer types with `z.infer`; never hand-maintain a parallel `interface` beside
  a schema.
- **Biome is authoritative for formatting and linting.** Single quotes, no semicolons,
  width 100, trailing commas. Never hand-format; run `pnpm format` or `pnpm check:fix`.
- **Naming:** files `kebab-case.ts` (React components may be `PascalCase.tsx`); types and
  components `PascalCase`; values and functions `camelCase`; Zod schemas end in `Schema`.
- **Tests are colocated** as `*.test.ts` next to the code, run with Vitest. Add or adjust
  tests with every behavior change.
- **Keep `protocol` pure:** no IO, no side effects, no `console`. Importing it does nothing.
- **Comments explain _why_,** not what the code plainly shows. JSDoc exported schemas and
  public functions, briefly.
- **Small modules, clear seams.** One responsibility per file. If a file grows a second job,
  split it.

---

## 3. The quality gate

Before handing off any change, this must be green:

```bash
pnpm format        # biome format --write
pnpm typecheck     # tsc across all packages
pnpm lint          # biome lint
pnpm test          # vitest
pnpm build         # turbo build
```

CI runs `pnpm check` (Biome format + lint + import checks, no writes) plus typecheck, test,
and build. A red gate does not ship.

---

## 4. Git conventions

- Branch off `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`.
- Conventional Commits: `type(scope): summary`
  - types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`
  - scope: the package (`protocol`, `daemon`, `gui`, `relay`) or area (`repo`, `ci`)
  - example: `feat(daemon): resolve account profile env before PTY spawn`
- One logical change per commit. The body explains why, wrapped at about 72 columns.
- **Never commit secrets.** Account credentials live in `~/.soromi/accounts/`, never in the
  repo; `soromi.space.json` references profiles by name only. Do commit `pnpm-lock.yaml`.

---

## 5. When in doubt

Prefer the smaller, more boring option. Soromi's novelty is the workspace/account model;
everything else is deliberately unremarkable. Boring is the point.
