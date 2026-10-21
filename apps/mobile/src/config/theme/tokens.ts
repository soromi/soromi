import { Platform, StyleSheet } from 'react-native'

//Type
import type { ColorScheme } from './types'

/** Foundation colours, matching the desktop's palette. Styles use `theme`, not these. */
export const primitives = {
  white: '#ffffff',
  transparent: 'transparent',
  /** What dims the screen behind a sheet. */
  scrim: 'rgba(0, 0, 0, 0.6)',
  grey: {
    100: '#f0f0f0',
    300: '#cccccc',
    500: '#6e6e6e',
    700: '#2a2a2a',
    800: '#1f1f1f',
    900: '#121213',
    950: '#09090a',
  },
  green: { 500: '#3ecf8e', 900: '#08321f', 950: '#12321f' },
  amber: { 500: '#d9a53f', 900: '#2a1e02' },
  red: { 300: '#f47070', 400: '#e08585', 950: '#3a1717' },
  blue: { 400: '#6b93d6' },
} as const

export const fontFamily = {
  /** The monospace face each platform ships. */
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const

export const theme = {
  surface: {
    page: primitives.grey[900],
    /** Recessed: inputs on a raised surface, the camera frame. */
    sunken: primitives.grey[950],
    /** Bars, cards and pressed rows. */
    raised: primitives.grey[800],
    /** Bubbles and secondary buttons. */
    active: primitives.grey[700],
    action: primitives.green[500],
    /** Another device is in control. */
    warn: primitives.amber[500],
    /** Nothing of its own: whatever is behind shows through. */
    clear: primitives.transparent,
    /** Over the screen, behind a sheet. */
    scrim: primitives.scrim,
  },
  text: {
    heading: primitives.grey[100],
    body: primitives.grey[300],
    muted: primitives.grey[500],
    action: primitives.green[500],
    onAction: primitives.green[900],
    onWarn: primitives.amber[900],
    danger: primitives.red[400],
    warn: primitives.amber[500],
    info: primitives.blue[400],
  },
  border: {
    default: primitives.grey[700],
    subtle: primitives.grey[800],
    warn: primitives.amber[500],
  },
  /** The lines of a diff: what was added, what was removed, and the header of each hunk. */
  diff: {
    add: { background: primitives.green[950], text: primitives.green[500] },
    del: { background: primitives.red[950], text: primitives.red[300] },
    hunk: { background: primitives.grey[800], text: primitives.grey[500] },
  },
  /**
   * A session's status, as the colour of its dot. The desktop's: amber is working, blue is waiting
   * on the user, red is blocked, green is finished and worth a look, grey is idle.
   */
  status: {
    thinking: primitives.amber[500],
    'waiting-input': primitives.blue[400],
    blocked: primitives.red[300],
    done: primitives.green[500],
    idle: primitives.grey[500],
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    sm2: 12,
    md: 16,
    lg: 20,
    xl: 32,
  },
  borderRadius: {
    sm: 7,
    md: 10,
    lg: 12,
    xl: 16,
    round: 999,
  },
  borderWidth: {
    hairline: StyleSheet.hairlineWidth,
  },
  typography: {
    title: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
    body: { fontSize: 15, lineHeight: 22 },
    bodySemiBold: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
    bodySm: { fontSize: 13, lineHeight: 19 },
    bodySmSemiBold: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
    caption: { fontSize: 12, lineHeight: 17 },
    captionSemiBold: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
    /** A section heading: small, spaced capitals. */
    label: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    mono: { fontSize: 12.5, lineHeight: 18, fontFamily: fontFamily.mono },
    /** Monospace at reading size: a file's name in a list. */
    monoBody: { fontSize: 14, lineHeight: 22, fontFamily: fontFamily.mono },
    /** Headings inside a message: sized for a chat, not a document. */
    heading1: { fontSize: 19, lineHeight: 26, fontWeight: '700' },
    heading2: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
    heading3: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  },
  /** Marks within a run of text. Each changes one trait and inherits the rest from its line. */
  inline: {
    strong: { fontWeight: '700' },
    em: { fontStyle: 'italic' },
    del: { textDecorationLine: 'line-through' },
    link: { textDecorationLine: 'underline' },
    code: { fontFamily: fontFamily.mono, fontSize: 13 },
  },
} as const

export type Theme = typeof theme
export type TypographyVariant = keyof Theme['typography']
export type TextTone = keyof Theme['text']

/** The theme for a colour scheme. There is one today; a light one is a second entry here. */
export const resolveTheme = (_scheme: ColorScheme): Theme => theme
