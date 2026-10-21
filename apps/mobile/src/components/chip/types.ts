import type { ReactNode } from 'react'

//Type
import type { IconName } from '../icon/types'

export type Props = {
  label: string
  /** An icon before the label. */
  icon?: IconName
  /** Anything else to put before the label, in place of an icon: a provider's mark, say. */
  leading?: ReactNode
  /** What it opens. Without one the chip only shows its value, and has no arrow. */
  onPress?: () => void
  /** On a surface of its own, where a plain one sits on whatever is behind it. */
  filled?: boolean
  disabled?: boolean
}
