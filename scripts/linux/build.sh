#!/bin/bash
# Builds Soromi for Linux, for the architecture it runs on: `cli` (the `soromi` binary, as a
# .tar.gz) or `desktop` (the app's .deb and .rpm). Meant to run in a Debian 11 container
# (`rust:1-bullseye`): what is built there needs glibc 2.31, so it runs on Ubuntu 20.04, Debian 11,
# RHEL 9 and anything newer. Built on a newer system it would not start on those.
#
# `scripts/build.mjs` runs it in Docker; CI runs it in the same image. It builds from a copy of
# SRC (the repository, which may be mounted read-only) and puts what it makes in OUT.
set -euo pipefail

KIND=${1:?usage: build.sh cli|desktop}
SRC=${SRC:-/src}
OUT=${OUT:-/out}
WORK=${WORK:-/tmp/soromi-build}
NODE_VERSION=22.23.3
PNPM_VERSION=10.11.0

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
VERSION=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$SRC/apps/desktop/package.json" | head -1)

export DEBIAN_FRONTEND=noninteractive
apt_install() {
  local missing=()
  for package in "$@"; do
    dpkg -s "$package" >/dev/null 2>&1 || missing+=("$package")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    apt-get -qq update >/dev/null
    apt-get -qq install -y "${missing[@]}" >/dev/null
  fi
}

apt_install rsync
mkdir -p "$WORK" "$OUT"
rsync -a --delete --exclude node_modules --exclude target --exclude out --exclude dist \
  --exclude .turbo --exclude apps/mobile "$SRC/" "$WORK/"
cd "$WORK"

case "$KIND" in
  cli)
    cargo build --release --locked -p soromi-daemon
    BIN="${CARGO_TARGET_DIR:-$WORK/target}/release/soromi-daemon"
    NAME="soromi-$VERSION-linux-$ARCH"
    STAGE=$(mktemp -d)
    install -m 755 "$BIN" "$STAGE/soromi"
    tar -czf "$OUT/$NAME.tar.gz" -C "$STAGE" soromi
    (cd "$OUT" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
    rm -rf "$STAGE"
    echo "built $OUT/$NAME.tar.gz"
    ;;
  desktop)
    apt_install fakeroot dpkg rpm xz-utils
    if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
      NODE_ARCH=$([ "$ARCH" = x64 ] && echo x64 || echo arm64)
      curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz" \
        | tar -xJ -C /opt
      export PATH="/opt/node-v$NODE_VERSION-linux-$NODE_ARCH/bin:$PATH"
    fi
    command -v pnpm >/dev/null || npm install -g "pnpm@$PNPM_VERSION" >/dev/null
    pnpm install --frozen-lockfile
    # The desktop package bundles `target/release/soromi-daemon`; point it at the cargo target dir.
    if [ -n "${CARGO_TARGET_DIR:-}" ]; then
      mkdir -p target "$CARGO_TARGET_DIR/release"
      ln -sfn "$CARGO_TARGET_DIR/release" target/release
    fi
    pnpm --filter @soromi/protocol build
    pnpm --filter @soromi/desktop make
    find apps/desktop/out/make -type f \( -name '*.deb' -o -name '*.rpm' \) -exec cp {} "$OUT/" \;
    echo "built:"
    ls "$OUT"/*"$VERSION"*.deb "$OUT"/*"$VERSION"*.rpm
    ;;
  *)
    echo "usage: build.sh cli|desktop" >&2
    exit 1
    ;;
esac
