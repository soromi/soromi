# Changesets

This repo versions with [Changesets](https://github.com/changesets/changesets) in **fixed mode**:
every `@soromi/*` package (and the Rust crates) share one product version.

## Releasing

From an up-to-date `main`, run:

```bash
pnpm release            # uses the changesets in this folder, or asks for the bump
pnpm release minor      # or patch / major: drafts the changelog from the commits since the last
                        # release and opens it in your git editor
```

[`scripts/release.mjs`](../scripts/release.mjs) runs the checks, bumps every `@soromi/*` package and
the Rust crates (`pnpm version-packages`, which needs `cargo install cargo-release`), writes the
changelogs, shows you the result, and after you confirm commits `chore: release X.Y.Z`, tags it
`X.Y.Z` and pushes both. The tag starts the **Release** workflow, which builds every platform and
publishes the GitHub release with that version's changelog as its notes.

`--yes` skips the confirmation and `--no-checks` skips typecheck, lint and tests.

To describe changes as you go instead, run `pnpm changeset` in a feature branch (pick
`@soromi/desktop` and the bump) and commit the file; `pnpm release` picks it up.

Nothing is published to npm or crates.io — every package is private / `publish = false`; changesets
is used purely for coordinated version bumps + changelogs that drive the app release.
