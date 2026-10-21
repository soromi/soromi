//Type
import type { IconName } from '../icon/types'

/** One choice of a segmented control. */
export type Option = {
  id: string
  label: string
  /** An icon before the label. */
  icon?: IconName
}

export type Props = {
  options: Option[]
  /** The `id` of the option that is picked. */
  value: string
  onChange: (id: string) => void
}

export type SegmentProps = {
  option: Option
  active: boolean
  onSelect: (id: string) => void
}
