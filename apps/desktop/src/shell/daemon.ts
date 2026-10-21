// The standalone `soromi-daemon` child process. The Electron main process is Node and can't run the
// Rust daemon in-process, so the shell spawns it, picks its port, and owns its lifecycle — unless
// a daemon already runs on the same Soromi home, which the window then uses as it is. Everything
// else — the sessions, agents, notifications — lives in the daemon; the renderer talks to it over WS.

import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { app } from 'electron'
import { isQuitting } from './lifecycle'
import { daemonBinary } from './paths'

let proc: ChildProcess | null = null

/**
 * How the window reaches the daemon: its loopback port, and the token its local link takes (only
 * this user can read it, in `<home>/daemon.json`). `null` for a daemon too old to ask for one.
 */
export interface DaemonLink {
  port: number
  token: string | null
}

/** The daemon's local WebSocket URL, carrying its token. */
export function daemonUrl(link: DaemonLink): string {
  const base = `ws://localhost:${link.port}`
  return link.token ? `${base}/?token=${encodeURIComponent(link.token)}` : base
}

/** Picks a free TCP port on loopback (the daemon then binds it via SOROMI_PORT). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      const port = typeof address === 'object' && address ? address.port : 0
      srv.close(() => resolve(port))
    })
  })
}

/**
 * The login shell's PATH. A launch from Finder or the dock (or, on Linux, from the desktop's app
 * menu) inherits only a minimal PATH, but the daemon launches agents (claude, etc.) and needs the
 * same PATH a terminal has, so we compute it here and pass it into the daemon child's env.
 */
function loginShellPath(): string {
  if (process.platform === 'win32') return process.env.PATH || ''
  try {
    const sh = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    const out = execFileSync(sh, ['-ilc', 'printf %s "$PATH"'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() || process.env.PATH || ''
  } catch {
    return process.env.PATH || ''
  }
}

/** Resolves once something is accepting connections on `port`, or after `timeout` ms regardless. */
function waitForPort(port: number, timeout = 8000): Promise<boolean> {
  const start = Date.now()
  return new Promise((resolve) => {
    const tryOnce = () => {
      const sock = net.connect(port, '127.0.0.1')
      sock.once('connect', () => {
        sock.destroy()
        resolve(true)
      })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() - start > timeout) resolve(false)
        else setTimeout(tryOnce, 120)
      })
    }
    tryOnce()
  })
}

/** The code a daemon exits with when another already runs on the same Soromi home (`instance.rs`). */
const ALREADY_RUNNING = 3

/** Where the daemon running on this Soromi home says it listens, and its token (`daemon.json`). */
function runningDaemon(): DaemonLink | null {
  const home = process.env.SOROMI_HOME || path.join(os.homedir(), '.soromi')
  try {
    const info = JSON.parse(fs.readFileSync(path.join(home, 'daemon.json'), 'utf8'))
    if (typeof info.port !== 'number') return null
    return { port: info.port, token: typeof info.token === 'string' ? info.token : null }
  } catch {
    return null
  }
}

/** Spawns the daemon on a free port with the full shell PATH, and a token for its local link that
 *  this app chooses, then waits for it to accept. Returns both, so the window can point the
 *  renderer at the daemon. If a daemon already runs on this Soromi home (`soromi serve` in a
 *  terminal, a service), the one spawned steps aside and the window uses that one instead, with the
 *  token it published; it is not this app's, so quitting leaves it running. */
export async function startDaemon(): Promise<DaemonLink> {
  const port = await freePort()
  const token = randomBytes(32).toString('hex')
  const child = spawn(daemonBinary(), [], {
    // SOROMI_LAUNCHER tells the daemon it is this app's, which it reports to every client.
    env: {
      ...process.env,
      SOROMI_PORT: String(port),
      SOROMI_LOCAL_TOKEN: token,
      SOROMI_LAUNCHER: 'desktop',
      PATH: loginShellPath(),
    },
    stdio: 'inherit',
  })
  proc = child

  const steppedAside = new Promise<DaemonLink | null>((resolve) => {
    child.once('exit', (code) => resolve(code === ALREADY_RUNNING ? runningDaemon() : null))
  })
  const outcome = await Promise.race([
    waitForPort(port).then(() => ({ own: { port, token } })),
    steppedAside.then((running) => ({ running })),
  ])
  if ('running' in outcome) {
    proc = null
    if (outcome.running !== null) return outcome.running
    console.error('soromi-daemon exited before it started')
    app.quit()
    return { port, token }
  }

  child.on('exit', (code) => {
    proc = null
    // If the daemon dies while we're running, there's nothing to show — bail out.
    if (!isQuitting()) {
      console.error(`soromi-daemon exited (code ${code})`)
      app.quit()
    }
  })
  return outcome.own
}

/** Kills the daemon child (on app quit) so agents don't outlive the app. */
export function stopDaemon(): void {
  if (proc) {
    proc.kill()
    proc = null
  }
}
