#!/usr/bin/env bash
#
# Release helper: bump every version in the repo to the next, commit it, and create the tag.
# It does NOT push. Pushing the tag is what triggers the CI release build, and stays a manual
# step you run yourself:  git push && git push origin <version>
#
# Usage:
#   pnpm release <patch|minor|major|X.Y.Z> [--dry-run]
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CONF="apps/desktop/src-tauri/tauri.conf.json"

# Files that carry the version. JSON ones only in their top block (line <= 6); Cargo ones on the
# package `version` line; plus the workspace crates in Cargo.lock.
JSON_FILES=(
  package.json
  packages/client/package.json
  packages/gui/package.json
  packages/protocol/package.json
  packages/web/package.json
  apps/desktop/package.json
  "$CONF"
)
CARGO_FILES=(
  crates/daemon/Cargo.toml
  crates/protocol/Cargo.toml
  apps/desktop/src-tauri/Cargo.toml
)
LOCK_CRATES=(soromi-daemon soromi-protocol soromi-desktop)

current="$(grep -m1 '"version"' "$CONF" | sed -E 's/.*"version": "([^"]+)".*/\1/')"

arg="${1:-}"
dry_run=false
[[ "${2:-}" == "--dry-run" || "$arg" == "--dry-run" ]] && dry_run=true
[[ "$arg" == "--dry-run" ]] && arg="${2:-}"

if [[ -z "$arg" ]]; then
  echo "current version: $current"
  echo "usage: pnpm release <patch|minor|major|X.Y.Z> [--dry-run]"
  exit 1
fi

# Compute the new version.
IFS='.' read -r MA MI PA <<<"$current"
case "$arg" in
  major) new="$((MA + 1)).0.0" ;;
  minor) new="${MA}.$((MI + 1)).0" ;;
  patch) new="${MA}.${MI}.$((PA + 1))" ;;
  *)
    if [[ ! "$arg" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "error: '$arg' is not a bump (patch|minor|major) or a version (X.Y.Z)." >&2
      exit 1
    fi
    new="$arg"
    ;;
esac

echo "Release $current -> $new"

if $dry_run; then
  echo "(dry run) would update:"
  printf '  %s\n' "${JSON_FILES[@]}" "${CARGO_FILES[@]}" "Cargo.lock (${LOCK_CRATES[*]})"
  echo "(dry run) would commit 'release: $new' and tag '$new' (no push)."
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean; commit or stash first." >&2
  exit 1
fi
if git rev-parse "$new" >/dev/null 2>&1; then
  echo "error: tag '$new' already exists." >&2
  exit 1
fi

# Escape dots in the current version so it is matched literally in the regexes below.
cre="${current//./\\.}"

for f in "${JSON_FILES[@]}"; do
  perl -i -pe 's/"version": "'"$cre"'"/"version": "'"$new"'"/ if $. <= 6' "$f"
done
for f in "${CARGO_FILES[@]}"; do
  perl -i -pe 's/^version = "'"$cre"'"$/version = "'"$new"'"/' "$f"
done
for pkg in "${LOCK_CRATES[@]}"; do
  perl -0777 -i -pe 's/(name = "'"$pkg"'"\nversion = )"'"$cre"'"/${1}"'"$new"'"/' Cargo.lock
done

git add "${JSON_FILES[@]}" "${CARGO_FILES[@]}" Cargo.lock
git commit -m "release: $new" >/dev/null
git tag "$new"

echo
echo "Committed and tagged $new (not pushed)."
echo "To publish (triggers the release build):"
echo "  git push && git push origin $new"
