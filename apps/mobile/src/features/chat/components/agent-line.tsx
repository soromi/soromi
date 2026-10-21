import { View } from 'react-native'

//Components
import { StatusDot, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Helpers
import { getAgentElapsed } from '../helpers'

//Type
import type { AgentLineProps } from '../types'

/** One agent working in the background: what it is doing, and for how long. */
export const AgentLine = (props: AgentLineProps) => {
  const styles = useThemedStyles(makeStyles)
  const agent = props.agent

  return (
    <View style={styles.line}>
      <StatusDot status={agent.status} />
      <Text variant="bodySm" numberOfLines={1} style={styles.name}>
        {agent.name}
      </Text>
      {agent.started_at != null && (
        <Text variant="bodySm" tone="muted" style={styles.elapsed}>
          {getAgentElapsed(agent.started_at, props.now)}
        </Text>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
  },
  name: { flex: 1 },
  // Digits of one width, so the line does not shift as the clock ticks.
  elapsed: { fontVariant: ['tabular-nums'] },
}))
