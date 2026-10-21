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
 * A row of a card that does something (add a folder, start a session, remove) or leads somewhere
 * (a workspace's earlier conversations, its usage), with what it shows at the right.
 */
export const ActionRow = ({ tone = 'action', ...props }: Props) => {
  const styles = useThemedStyles(makeStyles)
  const disabled = props.disabled

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.row,
      state.pressed && styles.pressed,
      disabled && styles.disabled,
    ],
    [styles, disabled],
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.hint}
      disabled={disabled}
      style={getStyle}
      onPress={props.onPress}
    >
      {props.icon && <Icon name={props.icon} size={18} tone={tone} />}
      <Text
        variant={tone === 'body' ? 'body' : 'bodySemiBold'}
        tone={tone === 'body' ? 'heading' : tone}
        numberOfLines={1}
        style={styles.label}
      >
        {props.label}
      </Text>
      {props.trailing}
      {props.chevron && <Icon name="chevron-right" size={16} />}
    </Pressable>
  )
}
