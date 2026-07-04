import { createTheme } from '@mantine/core'

//Types
import type { Status } from '@soromi/protocol'

/**
 * The palette lives in `styles/theme.css` as CSS variables (`--soromi-*`); components style
 * with CSS Modules referencing those. This module holds the Mantine theme plus the few
 * color values JS itself needs (e.g. the xterm theme) and small mapping helpers.
 */
export const colors = {
  bgTerminal: '#1f1f1f',
  text: '#cccccc',
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
    // Dark surfaces for Mantine components (menus, inputs, borders).
    dark: [
      '#cccccc',
      '#b5b5b5',
      '#9d9d9d',
      '#6e6e6e',
      '#3c3c3c',
      '#2b2b2b',
      '#252526',
      '#1f1f1f',
      '#181818',
      '#141414',
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
