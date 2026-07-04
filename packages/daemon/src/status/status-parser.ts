import type { Status } from '@soromi/protocol'

/**
 * First-pass heuristic status parser for the `claude` agent.
 *
 * Small and pluggable; real per-agent signal detection lands in Phase 2.6.
 * Returns `null` when a chunk carries no status-changing signal.
 */
export function parseStatus(chunk: string): Status | null {
  const text = chunk.toLowerCase()
  if (/\(y\/n\)|\[y\/n\]|allow .*\?/.test(text)) return 'waiting-input'
  if (/\berror\b|\bfailed\b|\bblocked\b/.test(text)) return 'blocked'
  if (/\bthinking\b|\breading\b|\bediting\b|\brunning\b/.test(text)) return 'thinking'
  if (/\bdone\b|\bpassed\b|\bcompleted\b/.test(text)) return 'done'
  return null
}
