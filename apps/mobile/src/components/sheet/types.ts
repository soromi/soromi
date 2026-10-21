import type { ReactNode } from 'react'

export type Props = {
  visible: boolean
  /** What is being chosen. */
  title: string
  /** Asked for by a tap outside the sheet, and by the system's back gesture. */
  onClose: () => void
  children: ReactNode
}

export type SheetConfig = {
  /** For a screen reader: what a tap outside the sheet does. */
  dismiss: string
}
