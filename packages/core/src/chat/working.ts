/**
 * Status words that cycle while a turn runs, so a long wait reads as alive. Every client shows the
 * same ones.
 */
export const WORKING_WORDS = [
  'Thinking',
  'Working',
  'Pondering',
  'Crunching',
  'Reasoning',
  'Digging in',
  'Noodling',
  'Cooking',
  'Untangling',
  'Percolating',
  'Synthesizing',
  'Mulling',
  'Scheming',
  'Wrangling',
] as const

/** How long each word shows before the next, in milliseconds. */
export const WORKING_WORD_MS = 3500

/** Elapsed seconds as a compact clock: `55s` under a minute, else `6m 55s`. */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`

  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** A token count abbreviated for the running line: `840`, `6.0k`, `1.2M`. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`

  return `${(count / 1_000_000).toFixed(1)}M`
}
