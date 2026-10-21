import type { ReactNode } from 'react'

//Type
import type { IconName } from '../icon/types'

export type Props = {
  icon?: IconName
  label: string
  /**
   * What colour it is: the action's green, red for what cannot be undone, or the body's for one
   * that leads somewhere rather than does something.
   */
  tone?: 'action' | 'danger' | 'body'
  /** At the right, before the chevron: a value the row shows. */
  trailing?: ReactNode
  /** It opens a screen of its own, which a chevron at the right says. */
  chevron?: boolean
  /** For a screen reader: what it says in place of the label, and what a tap does. */
  accessibilityLabel?: string
  hint?: string
  disabled?: boolean
  onPress: () => void
}
