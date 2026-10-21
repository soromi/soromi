import { useCallback } from 'react'
import { Pressable } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { KeyProps } from '../types'

/** One key of the row above the keyboard. */
export const Key = (props: KeyProps) => {
  const styles = useThemedStyles(makeStyles)
  const onSend = props.onSend
  const data = props.item.data

  const handlePress = useCallback(() => onSend(data), [onSend, data])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.key, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable accessibilityRole="button" hitSlop={4} style={getStyle} onPress={handlePress}>
      <Text variant="mono" tone="body">
        {props.item.label}
      </Text>
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  key: {
    minWidth: 42,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.surface.active,
  },
  pressed: { opacity: 0.6 },
}))
