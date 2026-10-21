import { sessionStatus } from '@soromi/core'
import { useCallback } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { ProviderMark, StatusDot, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Helpers
import { getSessionLine } from '../helpers'

//Hooks
import { useSessionItem } from '../hooks/use-session-item'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { CardProps } from '../types'

/**
 * One session in the grid: whose agent it is and its status, then its name and what it is doing.
 * Opens its conversation; a long press asks for its menu.
 */
export const SessionCard = (props: CardProps) => {
  const styles = useThemedStyles(makeStyles)
  const session = props.session
  const item = useSessionItem(session, props.peers, props.onMenu)

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.card, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable
      accessibilityRole="button"
      style={getStyle}
      onPress={item.handleOpen}
      onLongPress={item.handleLongPress}
    >
      <View style={styles.top}>
        <ProviderMark provider={session.agent} size={16} />
        <StatusDot status={sessionStatus(session)} />
      </View>
      <Text variant="title" numberOfLines={1}>
        {item.name}
      </Text>
      <Text variant="bodySm" tone="muted" numberOfLines={2}>
        {getSessionLine(session, props.now)}
      </Text>
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  card: {
    flex: 1,
    gap: theme.spacing.xs,
    // Room for two lines of detail, so cards in a row are of a height.
    minHeight: 112,
    padding: theme.spacing.sm2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    backgroundColor: theme.surface.raised,
  },
  pressed: { backgroundColor: theme.surface.active },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 16,
    marginBottom: theme.spacing.xs,
  },
}))
