import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { Icon, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { WorkspaceTally } from './tally'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getSessionCount, getWorkspaceHref } from '../helpers'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { WorkspaceRowProps } from '../types'

/**
 * One workspace on the home: its name, how many sessions it has, and how many of them are at work
 * or have finished. A tap opens its screen, with its sessions and what can be done there.
 */
export const WorkspaceRow = (props: WorkspaceRowProps) => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const name = props.workspace.name
  const sessions = props.workspace.sessions

  const handlePress = useCallback(() => router.push(getWorkspaceHref(name)), [router, name])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={SESSIONS.home.open}
      style={getStyle}
      onPress={handlePress}
    >
      <View style={styles.text}>
        <Text variant="bodySemiBold" tone="heading" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="bodySm" tone="muted">
          {getSessionCount(sessions.length)}
        </Text>
      </View>
      <WorkspaceTally sessions={sessions} quiet />
      <Icon name="chevron-right" size={16} />
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  pressed: { backgroundColor: theme.surface.raised },
  text: { flex: 1, gap: theme.spacing.xxs },
}))
