import { type ChildProcess, spawn } from 'node:child_process'

/** Holds the machine awake while engaged. Per-OS implementations sit behind this interface. */
export interface KeepAwake {
  engage(): void
  release(): void
}

/** macOS: holds a `caffeinate` process while engaged. */
export class CaffeinateKeepAwake implements KeepAwake {
  private process: ChildProcess | null = null

  engage(): void {
    if (this.process) return
    // -i prevent idle system sleep, -m keep the disk awake, -s prevent system sleep on AC.
    this.process = spawn('/usr/bin/caffeinate', ['-i', '-m', '-s'], { stdio: 'ignore' })
    this.process.on('error', () => {
      this.process = null
    })
  }

  release(): void {
    this.process?.kill()
    this.process = null
  }
}

/** No-op for unsupported platforms and tests. */
export class NoopKeepAwake implements KeepAwake {
  engage(): void {}
  release(): void {}
}

export function createKeepAwake(platform: NodeJS.Platform = process.platform): KeepAwake {
  return platform === 'darwin' ? new CaffeinateKeepAwake() : new NoopKeepAwake()
}
