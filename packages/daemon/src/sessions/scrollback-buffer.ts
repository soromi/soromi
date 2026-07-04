/**
 * A capped, append-only view of recent terminal output. Replayed to a viewport when
 * it attaches, so a reconnecting client sees the recent screen without the daemon
 * keeping unbounded history.
 */
export class ScrollbackBuffer {
  private chunks: string[] = []
  private size = 0

  constructor(private readonly maxChars: number) {}

  append(data: string): void {
    this.chunks.push(data)
    this.size += data.length

    while (this.size > this.maxChars && this.chunks.length > 1) {
      const removed = this.chunks.shift()
      if (removed !== undefined) this.size -= removed.length
    }

    const only = this.chunks[0]
    if (this.size > this.maxChars && this.chunks.length === 1 && only !== undefined) {
      const trimmed = only.slice(only.length - this.maxChars)
      this.chunks[0] = trimmed
      this.size = trimmed.length
    }
  }

  snapshot(): string {
    return this.chunks.join('')
  }

  clear(): void {
    this.chunks = []
    this.size = 0
  }
}
