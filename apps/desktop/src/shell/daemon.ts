// The standalone `soromi-daemon` child process. The Electron main process is Node and can't run the
// Rust daemon in-process, so the shell spawns it, picks its port, and owns its lifecycle. Everything
// else — the sessions, agents, notifications — lives in the daemon; the renderer talks to it over WS.

import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import * as net from 'node:net'
import { app } from 'electron'
import { isQuitting } from './lifecycle'
import { daemonBinary } from './paths'

let proc: ChildProcess | null = null

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
 * The login shell's PATH. A Finder/dock launch inherits only a minimal PATH, but the daemon launches
 * agents (claude, etc.) and needs the same PATH a terminal has, so we compute it here and pass it
 * into the daemon child's env.
 */
function loginShellPath(): string {
  if (process.platform !== 'darwin') return process.env.PATH || ''
  try {
    const sh = process.env.SHELL || '/bin/zsh'
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

/** Spawns the daemon on a free port with the full shell PATH, then waits for it to accept. Returns
 *  the port so the window can point the renderer at `ws://localhost:<port>`. */
export async function startDaemon(): Promise<number> {
  const port = await freePort()
  proc = spawn(daemonBinary(), [], {
    env: { ...process.env, SOROMI_PORT: String(port), PATH: loginShellPath() },
    stdio: 'inherit',
  })
  proc.on('exit', (code) => {
    proc = null
    // If the daemon dies while we're running, there's nothing to show — bail out.
    if (!isQuitting()) {
      console.error(`soromi-daemon exited (code ${code})`)
      app.quit()
    }
  })
  await waitForPort(port)
  return port
}

/** Kills the daemon child (on app quit) so agents don't outlive the app. */
export function stopDaemon(): void {
  if (proc) {
    proc.kill()
    proc = null
  }
}
