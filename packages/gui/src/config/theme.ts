import { createTheme } from '@mantine/core'

//Types
import type { Status } from '@soromi/protocol'

/**
 * The palette lives in `styles/theme.css` as CSS variables (`--soromi-*`); components style
 * with CSS Modules referencing those. This module holds the Mantine theme plus the few
 * color values JS itself needs (e.g. the xterm theme) and small mapping helpers.
 */
export const colors = {
  bgTerminal: '#161514',
  text: '#e8e5df',
}

export const theme = createTheme({
  primaryColor: 'jade',
  colors: {
    jade: [
      '#eafaf3',
      '#cfeadd',
      '#a9dcc5',
      '#7fcdac',
      '#5cbf98',
      '#4fae8d',
      '#3f9377',
      '#2d5c4b',
      '#25493c',
      '#1b362d',
    ],
  },
  fontFamily: '-apple-system, "Segoe UI", Inter, Roboto, sans-serif',
  fontFamilyMonospace: '"SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
})

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
