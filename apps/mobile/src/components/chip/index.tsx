import { useCallback } from 'react'
import { Pressable } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Components
import { Icon } from '../icon'
import { Text } from '../text'

//Styles
import { makeStyles } from './styles'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { Props } from './types'

/**
 * A small value that opens a choice when it has one: the model, the permission mode, the account.
 * With no `onPress` it only shows the value.
 */
export const Chip = ({ filled = false, ...props }: Props) => {
  const styles = useThemedStyles(makeStyles)
  const disabled = props.disabled
  const pressable = props.onPress !== undefined

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.base,
      filled && styles.filled,
      state.pressed && styles.pressed,
      disabled && styles.disabled,
    ],
    [styles, filled, disabled],
  )

  return (
    <Pressable
      accessibilityRole={pressable ? 'button' : 'text'}
      hitSlop={6}
      disabled={!pressable || props.disabled}
      style={getStyle}
      onPress={props.onPress}
    >
      {props.leading}
      {props.icon && <Icon name={props.icon} size={14} />}
      <Text variant="captionSemiBold" tone={filled ? 'body' : 'muted'} numberOfLines={1}>
        {props.label}
      </Text>
      {pressable && <Icon name="chevron-down" size={12} />}
    </Pressable>
  )
}
