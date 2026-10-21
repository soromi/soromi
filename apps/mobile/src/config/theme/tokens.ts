import { Platform, StyleSheet } from 'react-native'

//Type
import type { Status } from '@soromi/protocol'
import type { ColorScheme } from './types'

/** Foundation colours, matching the desktop's palette in each appearance. Styles use `theme`. */
export const primitives = {
  dark: {
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
  },
  /** The desktop's light theme: paper on a warm, quiet grey, a deeper emerald, warm near-black. */
  light: {
    transparent: 'transparent',
    scrim: 'rgba(28, 28, 26, 0.28)',
    paper: '#ffffff',
    grey: {
      50: '#f7f7f5',
      100: '#f3f3f1',
      200: '#ebebe8',
      300: '#e2e2de',
      400: '#d2d2cc',
      500: '#a9a9a2',
      600: '#6b6b65',
      800: '#43433f',
      900: '#1c1c1a',
    },
    green: { 50: '#e8f6ee', 600: '#12a066', 700: '#0e8d59', 800: '#14804f' },
    amber: { 500: '#d9a21b', 700: '#9a6a06', 900: '#2a2205' },
    red: { 50: '#fcecec', 500: '#d84a4a', 600: '#c94a43', 700: '#c23b3b' },
    blue: { 600: '#3d6fcc' },
  },
  /**
   * The desktop's code palettes, colour for colour. Dark: GitHub Dark (what it highlights a
   * message's code blocks with) and its file viewer's Dark+. Light: GitHub Light, and its file
   * viewer's light palette.
   */
  syntax: {
    githubDark: {
      plain: '#e6edf3',
      keyword: '#ff7b72',
      control: '#ff7b72',
      operator: '#ff7b72',
      string: '#a5d6ff',
      regexp: '#a5d6ff',
      number: '#79c0ff',
      literal: '#79c0ff',
      constant: '#79c0ff',
      comment: '#8b949e',
      function: '#d2a8ff',
      type: '#ffa657',
      builtin: '#ffa657',
      variable: '#e6edf3',
      parameter: '#e6edf3',
      property: '#79c0ff',
      attribute: '#79c0ff',
      tag: '#7ee787',
      meta: '#79c0ff',
      heading: '#79c0ff',
      link: '#a5d6ff',
      quote: '#7ee787',
      bullet: '#f2cc60',
      addition: '#aff5b4',
      deletion: '#ffdcd7',
    },
    darkPlus: {
      plain: '#cccccc',
      keyword: '#569cd6',
      control: '#c586c0',
      operator: '#cccccc',
      string: '#ce9178',
      regexp: '#d16969',
      number: '#b5cea8',
      literal: '#b5cea8',
      constant: '#4fc1ff',
      comment: '#6a9955',
      function: '#dcdcaa',
      type: '#4ec9b0',
      builtin: '#4ec9b0',
      variable: '#9cdcfe',
      parameter: '#9cdcfe',
      property: '#9cdcfe',
      attribute: '#9cdcfe',
      tag: '#569cd6',
      meta: '#9cdcfe',
      heading: '#569cd6',
      link: '#ce9178',
      quote: '#6a9955',
      bullet: '#6796e6',
      addition: '#b5cea8',
      deletion: '#ce9178',
    },
    githubLight: {
      plain: '#1f2328',
      keyword: '#cf222e',
      control: '#cf222e',
      operator: '#cf222e',
      string: '#0a3069',
      regexp: '#0a3069',
      number: '#0550ae',
      literal: '#0550ae',
      constant: '#0550ae',
      comment: '#6e7781',
      function: '#8250df',
      type: '#953800',
      builtin: '#953800',
      variable: '#1f2328',
      parameter: '#1f2328',
      property: '#0550ae',
      attribute: '#0550ae',
      tag: '#116329',
      meta: '#0550ae',
      heading: '#0550ae',
      link: '#0a3069',
      quote: '#116329',
      bullet: '#953800',
      addition: '#116329',
      deletion: '#82071e',
    },
    light: {
      plain: '#24292f',
      keyword: '#cf222e',
      control: '#cf222e',
      operator: '#24292f',
      string: '#0a3069',
      regexp: '#0a3069',
      number: '#0550ae',
      literal: '#0550ae',
      constant: '#0550ae',
      comment: '#6e7781',
      function: '#8250df',
      type: '#953800',
      builtin: '#953800',
      variable: '#24292f',
      parameter: '#24292f',
      property: '#24292f',
      attribute: '#0550ae',
      tag: '#116329',
      meta: '#0550ae',
      heading: '#0550ae',
      link: '#0a3069',
      quote: '#116329',
      bullet: '#953800',
      addition: '#116329',
      deletion: '#82071e',
    },
  },
} as const

export const fontFamily = {
  /** The monospace face each platform ships. */
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const

/** One colour per kind of code. */
type SyntaxColors = Record<keyof typeof primitives.syntax.githubDark, string>

/** The colours of one appearance, by what they are for. */
type ThemeColors = {
  /** Which appearance it is: what the status bar's and the keyboard's follow. */
  scheme: ColorScheme
  surface: {
    page: string
    /** Recessed: inputs on a raised surface, the camera frame. */
    sunken: string
    /** Bars, cards and pressed rows. */
    raised: string
    /** Bubbles and secondary buttons. */
    active: string
    action: string
    /** Another device is in control. */
    warn: string
    /** Nothing of its own: whatever is behind shows through. */
    clear: string
    /** Over the screen, behind a sheet. */
    scrim: string
  }
  text: {
    heading: string
    body: string
    muted: string
    action: string
    onAction: string
    onWarn: string
    danger: string
    warn: string
    info: string
  }
  border: { default: string; subtle: string; warn: string }
  /** Code coloured by language: in a message, as the desktop's chat does; in a file, as its viewer. */
  syntax: { message: SyntaxColors; file: SyntaxColors }
  /** The lines of a diff: what was added, what was removed, and the header of each hunk. */
  diff: Record<'add' | 'del' | 'hunk', { background: string; text: string }>
  /**
   * A session's status, as the colour of its dot. The desktop's: amber is working, blue is waiting
   * on the user, red is blocked, green is finished and worth a look, grey is idle.
   */
  status: Record<Status, string>
  /**
   * How full a plan's usage window is, as the colour of its bar: green while there is room, amber
   * as it fills, red at its limit. The track is the bar's empty part.
   */
  usage: { track: string; room: string; filling: string; full: string }
  /**
   * A terminal's page. Dark in either appearance: what programs print is coloured for a dark
   * background, and some of it would not read on a light one.
   */
  terminal: { background: string; foreground: string }
}

const dark = primitives.dark
const light = primitives.light

const darkColors: ThemeColors = {
  scheme: 'dark',
  surface: {
    page: dark.grey[900],
    sunken: dark.grey[950],
    raised: dark.grey[800],
    active: dark.grey[700],
    action: dark.green[500],
    warn: dark.amber[500],
    clear: dark.transparent,
    scrim: dark.scrim,
  },
  text: {
    heading: dark.grey[100],
    body: dark.grey[300],
    muted: dark.grey[500],
    action: dark.green[500],
    onAction: dark.green[900],
    onWarn: dark.amber[900],
    danger: dark.red[400],
    warn: dark.amber[500],
    info: dark.blue[400],
  },
  border: { default: dark.grey[700], subtle: dark.grey[800], warn: dark.amber[500] },
  syntax: { message: primitives.syntax.githubDark, file: primitives.syntax.darkPlus },
  diff: {
    add: { background: dark.green[950], text: dark.green[500] },
    del: { background: dark.red[950], text: dark.red[300] },
    hunk: { background: dark.grey[800], text: dark.grey[500] },
  },
  status: {
    thinking: dark.amber[500],
    'waiting-input': dark.blue[400],
    blocked: dark.red[300],
    done: dark.green[500],
    idle: dark.grey[500],
  },
  usage: {
    track: dark.grey[700],
    room: dark.green[500],
    filling: dark.amber[500],
    full: dark.red[300],
  },
  terminal: { background: dark.grey[900], foreground: dark.grey[100] },
}

const lightColors: ThemeColors = {
  scheme: 'light',
  surface: {
    page: light.grey[100],
    sunken: light.grey[50],
    raised: light.paper,
    active: light.grey[200],
    action: light.green[600],
    warn: light.amber[500],
    clear: light.transparent,
    scrim: light.scrim,
  },
  text: {
    heading: light.grey[900],
    body: light.grey[800],
    muted: light.grey[600],
    action: light.green[700],
    onAction: light.paper,
    onWarn: light.amber[900],
    danger: light.red[600],
    warn: light.amber[700],
    info: light.blue[600],
  },
  border: { default: light.grey[300], subtle: light.grey[200], warn: light.amber[500] },
  syntax: { message: primitives.syntax.githubLight, file: primitives.syntax.light },
  diff: {
    add: { background: light.green[50], text: light.green[800] },
    del: { background: light.red[50], text: light.red[700] },
    hunk: { background: light.grey[200], text: light.grey[600] },
  },
  status: {
    thinking: light.amber[500],
    'waiting-input': light.blue[600],
    blocked: light.red[500],
    done: light.green[600],
    idle: light.grey[500],
  },
  usage: {
    track: light.grey[300],
    room: light.green[600],
    filling: light.amber[500],
    full: light.red[500],
  },
  // As in the dark appearance: see `ThemeColors.terminal`.
  terminal: darkColors.terminal,
}

/** What does not change with the appearance: spacing, shapes, sizes and type. */
const shape = {
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
  /**
   * How tall a control is: a button, a text box, a picker, a row of a settings card. One height
   * for each size, so what sits side by side or one under the other lines up.
   */
  control: {
    sm: 36,
    md: 44,
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

export type Theme = ThemeColors & typeof shape

export const darkTheme: Theme = { ...darkColors, ...shape }
export const lightTheme: Theme = { ...lightColors, ...shape }
/** The dark appearance, which the app starts in. */
export const theme = darkTheme

export type TypographyVariant = keyof Theme['typography']
export type TextTone = keyof Theme['text']
/** Where code is shown, which decides its palette. */
export type SyntaxPalette = keyof Theme['syntax']
/** What a piece of code is, as far as its colour goes. */
export type SyntaxScope = keyof SyntaxColors

/** The theme for an appearance. */
export const resolveTheme = (scheme: ColorScheme): Theme =>
  scheme === 'light' ? lightTheme : darkTheme
