import type { TextTone } from '@/config/theme/tokens'
import type { ReactNode } from 'react'

export type Props = {
  /** What is handed to `onSelect`. */
  value: string
  label: string
  /** A line under the label saying what picking it means. */
  hint?: string
  /** The one in effect now. */
  selected?: boolean
  /** Something before the label: a provider's mark, say. */
  leading?: ReactNode
  disabled?: boolean
  /** The label's colour: `danger` for a choice that removes something. */
  tone?: TextTone
  onSelect: (value: string) => void
}
