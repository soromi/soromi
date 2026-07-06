import { createTheme } from '@mantine/core'

//Types
import type { Status } from '@soromi/protocol'

/**
 * The palette lives in `styles/theme.css` as CSS variables (`--soromi-*`); components style
 * with CSS Modules referencing those. This module holds the Mantine theme plus the few
 * color values JS itself needs (e.g. the xterm theme) and small mapping helpers.
 */
export const colors = {
  bgTerminal: '#0a0a0b',
  text: '#f0f0f0',
}

export const theme = createTheme({
  primaryColor: 'jade',
  // Rounder corners across Mantine components (menus, inputs, buttons, modals).
  defaultRadius: 'md',
  radius: {
    xs: '4px',
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '20px',
  },
  colors: {
    jade: [
      '#e6faf0',
      '#c3f0da',
      '#98e6bf',
      '#6ddba4',
      '#4ed492',
      '#3ecf8e',
      '#35c07a',
      '#2fae6a',
      '#1f7a49',
      '#0f4a2c',
    ],
    // Warm-neutral dark surfaces for Mantine components (menus, inputs, borders).
    dark: [
      '#f0f0f0',
      '#c9c9cc',
      '#8a8a8e',
      '#6a6a6e',
      '#2f2f33',
      '#242427',
      '#161618',
      '#0f0f11',
      '#0d0d0f',
      '#0a0a0b',
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
