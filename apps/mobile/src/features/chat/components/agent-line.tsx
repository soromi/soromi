import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { Pressable } from 'react-native'

//Components
import { StatusDot, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { getAgentElapsed, getAgentHref } from '../helpers'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { AgentLineProps } from '../types'

/**
 * One agent working in the background: what it is doing, and for how long. A tap opens its own
 * log, when the daemon has said how to ask for it.
 */
export const AgentLine = (props: AgentLineProps) => {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const agent = props.agent
  const session = props.session
  const id = agent.id
  const name = agent.name

  const handlePress = useCallback(() => {
    if (id) router.push(getAgentHref(session, id, name))
  }, [router, session, id, name])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.line, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={CHAT.agents.open}
      disabled={!id}
      style={getStyle}
      onPress={handlePress}
    >
      <StatusDot status={agent.status} />
      <Text variant="bodySm" numberOfLines={1} style={styles.name}>
        {agent.name}
      </Text>
      {agent.started_at != null && (
        <Text variant="bodySm" tone="muted" style={styles.elapsed}>
          {getAgentElapsed(agent.started_at, props.now)}
        </Text>
      )}
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
  },
  pressed: { opacity: 0.6 },
  name: { flex: 1 },
  // Digits of one width, so the line does not shift as the clock ticks.
  elapsed: { fontVariant: ['tabular-nums'] },
}))
