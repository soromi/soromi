//Packages
// The Mantine theme is shared with the web app so every Mantine surface matches.
export { theme } from '@soromi/ui'

//Types
import type { Status } from '@soromi/protocol'

/**
 * The palette lives in `@soromi/ui/theme.css` as CSS variables (`--soromi-*`); components style
 * with CSS Modules referencing those. This module holds the few color values JS itself needs
 * (e.g. the xterm theme) and small mapping helpers.
 */
export const colors = {
  bgTerminal: '#0a0a0b',
  text: '#f0f0f0',
}

/** Status dot variant, used to pick a CSS Module class (`warn` / `ok`, or none for idle). */
export function statusVariant(status: Status): 'warn' | 'ok' | 'idle' {
  if (status === 'waiting-input' || status === 'blocked') return 'warn'
  if (status === 'thinking' || status === 'done') return 'ok'
  return 'idle'
}

/** Account badge kind, used to pick a CSS Module class. */
export function accountKind(account: string): 'work' | 'personal' {
  return /work|client/i.test(account) ? 'work' : 'personal'
}
