//Types
import type { TerminalTheme } from '@soromi/client'
import type { Status } from '@soromi/protocol'
import type { Theme } from '@/stores/app-store'

/**
 * The palette lives in `@soromi/ui/theme.css` as CSS variables (`--soromi-*`), which every surface
 * styles with. This module holds the few color values JS itself needs, the terminal's, and small
 * mapping helpers.
 */
const TERMINAL: Record<Theme, TerminalTheme> = {
  // The panel's own background, with xterm's standard colors.
  dark: { background: '#121213', foreground: '#f0f0f0' },
  // Paper white, as the panel is, with GitHub's light terminal colors: a prompt's yellows and
  // cyans stay readable on white, as the standard ones do not.
  light: {
    background: '#ffffff',
    foreground: '#24292f',
    cursor: '#24292f',
    cursorAccent: '#ffffff',
    selectionBackground: '#d6e6fb',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#7d4e00',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#218bff',
    brightMagenta: '#a475f9',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f',
  },
}

/** The colors terminals are drawn in, for the app's appearance. */
export function terminalTheme(theme: Theme): TerminalTheme {
  return TERMINAL[theme]
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
