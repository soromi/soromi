//Type
import type { IconName } from '../icon/types'

export type Size = 'sm' | 'md'

/** `plain` is the icon alone, `primary` the main action, `secondary` a quieter one. */
export type Variant = 'plain' | 'primary' | 'secondary'

export type Props = {
  icon: IconName
  /** What it does, for a screen reader: an icon says nothing on its own. */
  label: string
  onPress: () => void
  size?: Size
  variant?: Variant
  disabled?: boolean
  /** The icon is filled in as well as outlined. */
  filled?: boolean
}
