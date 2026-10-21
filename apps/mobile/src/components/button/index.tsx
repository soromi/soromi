import { useCallback } from 'react'
import { Pressable } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Components
import { Text } from '../text'

//Helpers
import { getLabelTone, getLabelVariant } from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { Props } from './types'

/** A labelled, pressable action. */
export const Button = ({ size = 'md', variant = 'primary', ...props }: Props) => {
  const styles = useThemedStyles(makeStyles)
  const disabled = props.disabled
  const style = props.style

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.base,
      styles[size],
      styles[variant],
      state.pressed && styles.pressed,
      disabled && styles.disabled,
      style,
    ],
    [styles, size, variant, disabled, style],
  )

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      disabled={props.disabled}
      style={getStyle}
      onPress={props.onPress}
    >
      <Text variant={getLabelVariant(size)} tone={getLabelTone(variant)}>
        {props.label}
      </Text>
    </Pressable>
  )
}
