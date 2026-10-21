//Type
import type { ComputersConfig } from '../types'

export const COMPUTERS: ComputersConfig = {
  /** What a computer is called before it has said its name. */
  unnamed: 'Computer',
  title: 'Computers',
  /** Under the computer in use. */
  inUse: 'In use',
  pair: 'Pair another computer',
  pairHint: 'Scan the code its Soromi shows',
  /** What a tap on the title does, for a screen reader. */
  open: 'Switch computer',
  /** The value of the "pair another" choice, which no device id can be. */
  pairValue: '+pair',
}
