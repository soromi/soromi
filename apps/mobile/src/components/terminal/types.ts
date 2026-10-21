import type { RefObject } from 'react'

/** What the app can ask of a terminal on screen. */
export type TerminalHandle = {
  /** Draws output from the session. */
  write: (data: string) => void
  /** Clears the screen and its scrollback: what follows is a fresh start. */
  reset: () => void
  /** Sets the size the session's terminal has, for a phone that is watching it. */
  size: (cols: number, rows: number) => void
}

export type Props = {
  /** Filled with the handle once the terminal is ready, and emptied when it goes. */
  terminalRef: RefObject<TerminalHandle | null>
  /**
   * Whether this phone drives the terminal: types into it and decides its size, which is then
   * whatever fits the screen. A phone that only watches takes the size it is told.
   */
  driving: boolean
  /** The terminal is on screen and can be written to. */
  onReady: () => void
  /** Keys were typed into the terminal. Only while driving. */
  onInput: (data: string) => void
  /** The terminal was fitted to the screen. Only while driving. */
  onSize: (cols: number, rows: number) => void
}

/** What the page says to the app. */
export type PageMessage =
  | { type: 'ready' }
  | { type: 'input'; data: string }
  | { type: 'size'; cols: number; rows: number }

export type TerminalConfig = {
  /** The size of the terminal's type when there is room for it. */
  fontSize: number
  /** How long output is gathered before it is handed to the page, in milliseconds. */
  flushMs: number
  /** Where the page is told to believe it was loaded from. */
  origin: string[]
}
