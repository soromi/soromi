#!/bin/sh
# Installs Soromi's daemon and its `soromi` command on this machine, then sets the machine up:
#
#   curl -fsSL https://raw.githubusercontent.com/soromi/soromi/main/scripts/install.sh | sh
#
# It downloads the build for this system (Linux x86_64 or arm64, or a Mac with Apple Silicon) from
# the latest release, checks it against its checksum, puts it at ~/.local/bin/soromi, and runs
# `soromi setup`: Soromi as a service, a check of the agents, and a phone paired. Run again, it
# updates Soromi in place.
#
# Settings, as environment variables:
#   SOROMI_VERSION   a release tag to install instead of the latest (e.g. 1.2.0)
#   SOROMI_BIN_DIR   where to put `soromi` (default: ~/.local/bin)
#   SOROMI_NO_SETUP  1 to install only, without `soromi setup`
#   SOROMI_ARCHIVE   a build already on disk (a soromi-*.tar.gz), instead of downloading one
#   SOROMI_REPO      the GitHub repository releases come from (default: soromi/soromi)
set -eu

REPO="${SOROMI_REPO:-soromi/soromi}"
VERSION="${SOROMI_VERSION:-latest}"
BIN_DIR="${SOROMI_BIN_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'soromi install: %s\n' "$*" >&2
  exit 1
}

# What this machine is, as the release names its builds.
case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=macos ;;
  *) fail "Soromi runs on Linux and macOS, not $(uname -s)." ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) fail "there is no build for a $(uname -m) processor." ;;
esac
if [ "$os" = macos ] && [ "$arch" = x64 ]; then
  fail "there is no build for an Intel Mac yet."
fi

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1"; }
  fetch_to() { curl -fsSL -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO- "$1"; }
  fetch_to() { wget -qO "$2" "$1"; }
else
  fail "curl or wget is needed to download Soromi."
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | cut -d' ' -f1; }
else
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
archive="$work/soromi.tar.gz"

if [ -n "${SOROMI_ARCHIVE:-}" ]; then
  [ -f "$SOROMI_ARCHIVE" ] || fail "no build at $SOROMI_ARCHIVE"
  cp "$SOROMI_ARCHIVE" "$archive"
  [ -f "$SOROMI_ARCHIVE.sha256" ] && cp "$SOROMI_ARCHIVE.sha256" "$archive.sha256"
else
  if [ "$VERSION" = latest ]; then
    api="https://api.github.com/repos/$REPO/releases/latest"
  else
    api="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
  fi
  say "Looking for Soromi ($VERSION) for $os $arch…"
  release="$(fetch "$api")" || fail "could not reach $api"
  # The build for this system, by the end of its name: `soromi-<version>-<os>-<arch>.tar.gz`.
  url="$(printf '%s' "$release" |
    grep -o "\"browser_download_url\": *\"[^\"]*-$os-$arch\.tar\.gz\"" |
    head -n 1 | sed 's/.*"\(https[^"]*\)"$/\1/')"
  [ -n "$url" ] || fail "the release has no build for $os $arch."
  say "Downloading $(basename "$url")…"
  fetch_to "$url" "$archive" || fail "the download failed."
  fetch_to "$url.sha256" "$archive.sha256" || fail "its checksum is missing from the release."
fi

# The build is the one the release says it is.
if [ -f "$archive.sha256" ]; then
  expected="$(cut -d' ' -f1 <"$archive.sha256")"
  [ "$(sha256 "$archive")" = "$expected" ] || fail "the download does not match its checksum."
else
  say "No checksum next to $SOROMI_ARCHIVE: not checked."
fi

tar -xzf "$archive" -C "$work"
[ -f "$work/soromi" ] || fail "the build has no soromi in it."
mkdir -p "$BIN_DIR"
# Moved into place in one step, so a running service's binary is replaced, never half written.
cp "$work/soromi" "$BIN_DIR/.soromi.new"
chmod 755 "$BIN_DIR/.soromi.new"
mv "$BIN_DIR/.soromi.new" "$BIN_DIR/soromi"
say "Installed $("$BIN_DIR/soromi" version) at $BIN_DIR/soromi"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    say ""
    say "$BIN_DIR is not on your PATH. Add it, so \`soromi\` works in a new shell:"
    say "    echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.profile"
    ;;
esac

if [ "${SOROMI_NO_SETUP:-0}" = 1 ]; then
  say "Run \`soromi setup\` to set this machine up."
  exit 0
fi
say ""
exec "$BIN_DIR/soromi" setup
