//Type
import type { TerminalConfig } from './types'

export const TERMINAL: TerminalConfig = {
  fontSize: 13,
  // One hand-over per frame, however many pieces the output arrived in.
  flushMs: 16,
  origin: ['*'],
}
