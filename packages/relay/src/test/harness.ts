import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { WebSocket } from 'ws'

//Config
import { config } from '../config/app'

/** The access key the relay under test is started with. */
export const ACCESS_KEY = 'test-access-key'

/**
 * The relay, run by `wrangler dev` (the runtime Cloudflare runs it on), on a port of its own. It
 * takes a few seconds to start; `stop` ends it and the runtime it started.
 */
export async function startRelay(): Promise<{ base: string; stop: () => void }> {
  const port = 18_000 + Math.floor(Math.random() * 1000)
  const base = `127.0.0.1:${port}`
  const state = mkdtempSync(join(tmpdir(), 'soromi-relay-'))
  const worker = spawn(
    'node_modules/.bin/wrangler',
    [
      'dev',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--var',
      `RELAY_ACCESS_KEY:${ACCESS_KEY}`,
      '--persist-to',
      state,
      '--show-interactive-dev-session=false',
    ],
    {
      cwd: join(__dirname, '../..'),
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      // Its own process group, so stopping it stops the runtime it starts too.
      detached: true,
    },
  )
  const stop = () => {
    if (worker.pid) process.kill(-worker.pid)
    rmSync(state, { recursive: true, force: true })
  }

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const health = await fetch(`http://${base}/health`)
      .then((response) => response.text())
      .catch(() => '')
    if (health === 'ok') return { base, stop }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  stop()
  throw new Error('wrangler dev did not start')
}

/** Peers of the relay at `base`: a daemon (`host`) with the key, a phone (`device`) without. */
export function peers(base: string) {
  const url = (room: string, role?: string) =>
    `ws://${base}/?room=${room}${role ? `&role=${role}` : ''}`

  return {
    url,
    host: (room: string) =>
      new WebSocket(url(room, 'host'), { headers: { [config.accessHeader]: ACCESS_KEY } }),
    device: (room: string) => new WebSocket(url(room, 'device')),
  }
}

/** Resolves once the socket is open. */
export function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
}

/**
 * Resolves with the code the relay closed a socket with, as soon as its close frame arrives. The
 * local runtime leaves the connection half-open after the closing handshake, which this client
 * would wait out for 30 seconds; the daemon and the phone act on the close frame itself.
 */
export function closed(socket: WebSocket): Promise<number> {
  const frame = socket as unknown as { _closeFrameReceived: boolean; _closeCode: number }
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (!frame._closeFrameReceived) return
      clearInterval(timer)
      resolve(frame._closeCode)
    }, 20)
    socket.once('close', (code) => {
      clearInterval(timer)
      resolve(code)
    })
  })
}

/**
 * A socket's frames from the moment it is made, so none is missed between two awaits: its data
 * frames, and the peer counts the relay told it.
 */
export function inbox(socket: WebSocket) {
  const waiting: Buffer[] = []
  const presence: number[] = []
  let wake: (() => void) | null = null
  socket.on('message', (data: Buffer, binary: boolean) => {
    const text = binary ? '' : data.toString()
    if (text.includes('"__relay"')) presence.push(JSON.parse(text).peers)
    else waiting.push(data)
    wake?.()
  })

  const until = async (ready: () => boolean, ms: number) => {
    const deadline = Date.now() + ms
    while (!ready()) {
      const left = deadline - Date.now()
      if (left <= 0) throw new Error('timed out')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left)
        wake = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    }
  }

  return {
    /** The next data frame. */
    async next(ms = 2000): Promise<Buffer> {
      await until(() => waiting.length > 0, ms)
      return waiting.shift() as Buffer
    },
    /** Resolves once the relay has said there are `peers` in the room. */
    async peers(peers: number, ms = 2000): Promise<void> {
      await until(() => presence.at(-1) === peers, ms)
    },
    /** Resolves once the peer counts the relay has said are exactly `counts`, in order. */
    async presence(counts: number[], ms = 2000): Promise<void> {
      await until(() => presence.length >= counts.length, ms).catch(() => {})
      expect(presence).toEqual(counts)
    },
  }
}
