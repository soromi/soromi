import type { StyleProp, ViewStyle } from 'react-native'

export type Size = 'sm' | 'md'

/**
 * `primary` is the main action, `secondary` a quieter one, `warn` takes control from another
 * device, and `plain` is text only.
 */
export type Variant = 'primary' | 'secondary' | 'warn' | 'plain'

export type Props = {
  label: string
  onPress: () => void
  size?: Size
  variant?: Variant
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}
