/** How full the context window must be before a conversation is said to be filling it. */
export const CONTEXT_WARN_PERCENT = 80

/** How much of the model's context window a conversation fills, as a whole percent up to 100. */
export function contextPercent(tokens: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((tokens / limit) * 100))
}

/** Whether a conversation fills enough of the window to say so, and offer to compact or clear it. */
export function isContextFilling(tokens: number | null | undefined, limit: number): boolean {
  return tokens != null && contextPercent(tokens, limit) >= CONTEXT_WARN_PERCENT
}
