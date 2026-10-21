import { sessionStatus } from '@soromi/core'
import { useCallback } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { StatusDot, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Helpers
import { getSessionLine } from '../helpers'

//Hooks
import { useSessionItem } from '../hooks/use-session-item'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { RowProps } from '../types'

/**
 * One session in the list: its status, name and what it is doing. Opens its conversation; a long
 * press asks for its menu.
 */
export const SessionRow = (props: RowProps) => {
  const styles = useThemedStyles(makeStyles)
  const session = props.session
  const item = useSessionItem(session, props.peers, props.onMenu)
  const active = props.active
  const flush = props.flush

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [
      styles.row,
      flush && styles.flush,
      active && styles.active,
      state.pressed && styles.pressed,
    ],
    [styles, flush, active],
  )

  return (
    <Pressable
      accessibilityRole="button"
      style={getStyle}
      onPress={item.handleOpen}
      onLongPress={item.handleLongPress}
    >
      <StatusDot status={sessionStatus(session)} />
      <View style={styles.text}>
        <Text variant="title" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="bodySm" tone="muted" numberOfLines={1}>
          {getSessionLine(session, props.now)}
        </Text>
      </View>
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    // Set in under its workspace's name.
    paddingLeft: theme.spacing.xl,
    paddingRight: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  flush: { paddingLeft: theme.spacing.md },
  pressed: { backgroundColor: theme.surface.raised },
  active: { backgroundColor: theme.surface.raised },
  text: { flex: 1, gap: theme.spacing.xxs },
}))
