import { type IPty, spawn } from 'node-pty'

//
import { StatusState } from '../status/status-state'
import { ScrollbackBuffer } from './scrollback-buffer'

//Types
import type { Status } from '@soromi/protocol'

const FLUSH_INTERVAL_MS = 16
const SCROLLBACK_CHARS = 200_000

export interface SessionOptions {
  command: string
  args?: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
  cols?: number
  rows?: number
}

/**
 * The transport-facing surface of a session. The WebSocket layer depends on this, not
 * on the concrete `Session`, so it can be exercised without a real PTY.
 */
export interface SessionLike {
  snapshot(): string
  status(): Status
  onOutput(listener: (data: string) => void): () => void
  onStatus(listener: (status: Status) => void): () => void
  write(data: string): void
  resize(cols: number, rows: number): void
}

/**
 * Owns one PTY. Buffers output into capped scrollback and flushes it to listeners in
 * batched ~16ms frames, and derives the agent status from that output.
 */
export class Session implements SessionLike {
  private readonly pty: IPty
  private readonly scrollback = new ScrollbackBuffer(SCROLLBACK_CHARS)
  private readonly statusState = new StatusState()
  private readonly outputListeners = new Set<(data: string) => void>()
  private readonly statusListeners = new Set<(status: Status) => void>()
  private pending = ''
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: SessionOptions) {
    this.pty = spawn(opts.command, opts.args ?? [], {
      name: 'xterm-color',
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
    })
    this.pty.onData((data) => this.handleData(data))
    this.pty.onExit(() => this.flush())
  }

  private handleData(data: string): void {
    this.scrollback.append(data)
    this.pending += data

    const changed = this.statusState.update(data)
    if (changed) {
      for (const listener of this.statusListeners) listener(changed)
    }

    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS)
    }
  }

  private flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.pending.length === 0) return
    const data = this.pending
    this.pending = ''
    for (const listener of this.outputListeners) listener(data)
  }

  snapshot(): string {
    return this.scrollback.snapshot()
  }

  status(): Status {
    return this.statusState.get()
  }

  onOutput(listener: (data: string) => void): () => void {
    this.outputListeners.add(listener)
    return () => {
      this.outputListeners.delete(listener)
    }
  }

  onStatus(listener: (status: Status) => void): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  write(data: string): void {
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows)
  }

  dispose(): void {
    this.flush()
    this.pty.kill()
  }
}
