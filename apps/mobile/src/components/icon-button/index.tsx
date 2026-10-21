import { useCallback } from 'react'
import { Pressable } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Components
import { Icon } from '../icon'

//Helpers
import { getIconSize, getIconTone } from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { Props } from './types'

/** A pressable action shown as an icon alone. */
export const IconButton = ({ size = 'md', variant = 'plain', ...props }: Props) => {
  const styles = useThemedStyles(makeStyles)
  const disabled = props.disabled

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.base,
      styles[size],
      styles[variant],
      state.pressed && styles.pressed,
      disabled && styles.disabled,
    ],
    [styles, size, variant, disabled],
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      hitSlop={8}
      disabled={props.disabled}
      style={getStyle}
      onPress={props.onPress}
    >
      <Icon
        name={props.icon}
        size={getIconSize(size)}
        tone={getIconTone(variant)}
        filled={props.filled}
      />
    </Pressable>
  )
}
