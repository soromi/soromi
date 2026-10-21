import { sessionStatus } from '@soromi/core'
import { useCallback } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { Icon, StatusDot, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getSessionLine } from '../helpers'

//Hooks
import { useSessionItem } from '../hooks/use-session-item'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { AttentionRowProps } from '../types'

/**
 * A session that needs the person, at the top of the home: its status, its name, the workspace it
 * is in and what it is waiting for. Opens its conversation; a long press asks for its menu.
 */
export const AttentionRow = (props: AttentionRowProps) => {
  const styles = useThemedStyles(makeStyles)
  const session = props.item.session
  const item = useSessionItem(session, props.item.peers, props.onMenu)

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, state.pressed && styles.pressed],
    [styles],
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
          {`${props.item.workspace}${SESSIONS.separator}${getSessionLine(session, props.now)}`}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} />
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: theme.control.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  pressed: { backgroundColor: theme.surface.active },
  text: { flex: 1, gap: theme.spacing.xxs },
}))
