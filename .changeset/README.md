# Changesets

This repo versions with [Changesets](https://github.com/changesets/changesets) in **fixed mode**:
every `@soromi/*` package (and the Rust crates) share one product version.

## Workflow

1. In a PR that changes behavior, run `pnpm changeset` and describe the change + pick the bump
   (patch / minor / major). This writes a markdown file under `.changeset/` — commit it with the PR.
2. On merge to `main`, the **Version** workflow opens (or updates) a "Version Packages" PR that
   consumes the pending changesets: it bumps every `@soromi/*` package, applies the same version to
   the Rust crates via `cargo release version` (`Cargo.toml` + `Cargo.lock`), and writes changelogs.
3. Merge that PR, then **tag it yourself**: `git tag vX.Y.Z && git push origin vX.Y.Z`. That triggers
   the **Release** workflow to build + notarize the desktop app and attach it to the GitHub release.

Nothing is published to npm or crates.io — every package is private / `publish = false`; changesets
is used purely for coordinated version bumps + changelogs that drive the app release.
