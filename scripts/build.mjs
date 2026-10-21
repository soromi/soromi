#!/usr/bin/env node
// Builds what Soromi ships, per system, into `out/release/`:
//
//   node scripts/build.mjs desktop mac             the app, signed, notarized and checked (.zip)
//   node scripts/build.mjs desktop linux [--arch]  the app's .deb and .rpm
//   node scripts/build.mjs cli mac                 the `soromi` binary, signed and notarized (.tar.gz)
//   node scripts/build.mjs cli linux [--arch]      the `soromi` binary (.tar.gz)
//
// `--arch` is x64, arm64 or all (the default: this machine's). Linux builds run in Docker
// (`rust:1-bullseye`, see scripts/linux/build.sh), so they work from a Mac and the result runs on
// older systems too; the architecture that is not this machine's is emulated, and slow.
//
// Signing needs a "Developer ID Application" certificate in the keychain. Notarizing uses the
// APPLE_ID, APPLE_PASSWORD (app-specific) and APPLE_TEAM_ID environment variables when set (CI),
// otherwise the `soromi-notary` keychain profile (`xcrun notarytool store-credentials soromi-notary`).
// Without a certificate the Mac builds are made unsigned, and say so.

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'out', 'release')
const VERSION = JSON.parse(readFileSync(join(ROOT, 'apps/desktop/package.json'), 'utf8')).version
const NOTARY_PROFILE = 'soromi-notary'
const LINUX_IMAGE = 'rust:1-bullseye'
const HOST_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'

const USAGE = `usage: node scripts/build.mjs <desktop|cli> <mac|linux> [--arch x64|arm64|all]`

function main() {
  const [kind, system, ...rest] = process.argv.slice(2)
  const arch = readArch(rest)
  if (!['desktop', 'cli'].includes(kind) || !['mac', 'linux'].includes(system)) fail(USAGE)
  mkdirSync(OUT, { recursive: true })

  if (system === 'mac') {
    if (process.platform !== 'darwin') fail('Mac builds are made on a Mac.')
    if (arch !== HOST_ARCH) fail(`Mac builds are made for this Mac's architecture (${HOST_ARCH}).`)
    if (kind === 'desktop') desktopMac()
    else cliMac()
  } else {
    for (const one of arch === 'all' ? ['x64', 'arm64'] : [arch]) linux(kind, one)
  }
  console.log(`\nDone. Everything built is in ${OUT}`)
}

function readArch(rest) {
  const at = rest.indexOf('--arch')
  if (at === -1) return HOST_ARCH
  const arch = rest[at + 1]
  if (!['x64', 'arm64', 'all'].includes(arch)) fail(USAGE)
  return arch
}

/** The app: Electron Forge builds, signs and notarizes it, then it is checked and zipped. */
function desktopMac() {
  const signing = identity()
  if (!signing) warn('No Developer ID certificate in the keychain: the app will be unsigned.')

  step('Building the protocol types')
  run('pnpm', ['--filter', '@soromi/protocol', 'build'])
  step('Building, signing and notarizing the app')
  run('pnpm', ['--filter', '@soromi/desktop', 'make'])

  const app = join(ROOT, `apps/desktop/out/Soromi-darwin-${HOST_ARCH}/Soromi.app`)
  if (signing) {
    step('Checking the app')
    // Gatekeeper's own verdict, and the notarization ticket stapled to the app.
    run('spctl', ['-a', '-t', 'exec', '-vvv', app])
    run('xcrun', ['stapler', 'validate', app])
  }

  const zips = join(ROOT, `apps/desktop/out/make/zip/darwin/${HOST_ARCH}`)
  const zip = readdirSync(zips).find((name) => name.endsWith(`${VERSION}.zip`))
  if (!zip) fail(`No zip for ${VERSION} in ${zips}`)
  publish(join(zips, zip), `Soromi-${VERSION}-macos-${HOST_ARCH}.zip`)
}

/** The `soromi` binary, on its own: signed with the hardened runtime and notarized. */
function cliMac() {
  step('Building the daemon')
  run('cargo', ['build', '--release', '--locked', '-p', 'soromi-daemon'])

  const stage = mkdtempSync(join(tmpdir(), 'soromi-cli-'))
  const binary = join(stage, 'soromi')
  copyFileSync(join(ROOT, 'target/release/soromi-daemon'), binary)

  const signing = identity()
  if (signing) {
    step('Signing')
    run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', signing, binary])
    step('Notarizing (this takes a few minutes)')
    // A bare binary cannot carry a stapled ticket; Gatekeeper looks it up online instead.
    const submission = join(stage, 'soromi.zip')
    run('ditto', ['-c', '-k', '--keepParent', binary, submission])
    notarize(submission)
    rmSync(submission)
  } else {
    warn('No Developer ID certificate in the keychain: the binary is unsigned.')
  }

  const name = `soromi-${VERSION}-macos-${HOST_ARCH}.tar.gz`
  run('tar', ['-czf', join(OUT, name), '-C', stage, 'soromi'])
  checksum(name)
  rmSync(stage, { recursive: true, force: true })
  console.log(`built ${join(OUT, name)}`)
}

/** A Linux build, in a container of that architecture. */
function linux(kind, arch) {
  step(`Building the Linux ${kind} for ${arch}${arch === HOST_ARCH ? '' : ' (emulated, slow)'}`)
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    fail('Linux builds run in Docker, and Docker is not running.')
  }
  const platform = arch === 'x64' ? 'linux/amd64' : 'linux/arm64'
  // Cargo's downloads and build output are kept in volumes, so a second build is quick.
  run('docker', [
    'run',
    '--rm',
    '--platform',
    platform,
    '--shm-size=1g',
    '-v',
    `${ROOT}:/src:ro`,
    '-v',
    `${OUT}:/out`,
    '-v',
    `soromi-build-cargo-${arch}:/usr/local/cargo/registry`,
    '-v',
    `soromi-build-target-${arch}:/target`,
    '-e',
    'CARGO_TARGET_DIR=/target',
    LINUX_IMAGE,
    'bash',
    '/src/scripts/linux/build.sh',
    kind,
  ])
}

/** The Developer ID identity to sign with, if the keychain has one. */
function identity() {
  const found = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  })
  const line = (found.stdout ?? '')
    .split('\n')
    .find((one) => one.includes('Developer ID Application'))
  return line?.match(/"(.+)"/)?.[1] ?? null
}

/** Submits a zip to Apple and waits for its verdict, which must be "Accepted". */
function notarize(file) {
  const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env
  const credentials = APPLE_ID
    ? ['--apple-id', APPLE_ID, '--password', APPLE_PASSWORD ?? '', '--team-id', APPLE_TEAM_ID ?? '']
    : ['--keychain-profile', NOTARY_PROFILE]
  const result = spawnSync('xcrun', ['notarytool', 'submit', file, ...credentials, '--wait'], {
    encoding: 'utf8',
  })
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (result.status !== 0 || !/status: Accepted/.test(result.stdout ?? '')) {
    fail('Notarization was not accepted. `xcrun notarytool log <id>` says why.')
  }
}

function publish(file, name) {
  copyFileSync(file, join(OUT, name))
  checksum(name)
  console.log(`built ${join(OUT, name)}`)
}

/** Writes `<name>.sha256` beside it, in the format `shasum -a 256 -c` checks. */
function checksum(name) {
  const hash = createHash('sha256')
    .update(readFileSync(join(OUT, name)))
    .digest('hex')
  writeFileSync(join(OUT, `${name}.sha256`), `${hash}  ${name}\n`)
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' })
  if (result.status !== 0) fail(`${command} ${args.slice(0, 3).join(' ')} failed`)
}

function step(text) {
  console.log(`\n==> ${text}`)
}

function warn(text) {
  console.warn(`warning: ${text}`)
}

function fail(text) {
  console.error(`error: ${text}`)
  process.exit(1)
}

main()
