import { useCallback, useState } from 'react'
import { View } from 'react-native'

//Components
import { Button, StatusDot, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { AgentLine } from './agent-line'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { getAgentsLabel } from '../helpers'

//Hooks
import { useNow } from '../hooks/use-now'

//Services
import { LinkService } from '@/services/link'

//Type
import type { AgentsProps } from '../types'

/**
 * Above the message box while the agent has others working in the background: how many, a list of
 * them with how long each has run, and the way to stop the work. They often outlast the turn that
 * started them, so this stays up while the main agent says it is waiting.
 */
export const Agents = (props: AgentsProps) => {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const session = props.session
  const agents = props.agents
  const count = agents?.length ?? 0
  const now = useNow(count > 0)

  const handleToggle = useCallback(() => setOpen((value) => !value), [])

  const handleStop = useCallback(
    () => LinkService.send({ type: 'chat-interrupt', session }),
    [session],
  )

  if (!agents || count === 0) return null

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <StatusDot status="thinking" />
        <Text variant="bodySmSemiBold" numberOfLines={1} style={styles.label}>
          {getAgentsLabel(count)}
        </Text>
        <Button
          size="sm"
          variant="plain"
          label={open ? CHAT.agents.hide : CHAT.agents.show}
          onPress={handleToggle}
        />
        <Button
          size="sm"
          variant="secondary"
          label={CHAT.agents.stop}
          disabled={!props.enabled}
          onPress={handleStop}
        />
      </View>
      {open && (
        <View style={styles.list}>
          {agents.map((agent, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: agents have no id of their own; their order holds.
            <AgentLine key={index} agent={agent} now={now} />
          ))}
        </View>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm2,
    paddingTop: theme.spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    borderRadius: theme.borderRadius.lg,
  },
  label: { flex: 1 },
  list: {
    paddingHorizontal: theme.spacing.sm2,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    borderRadius: theme.borderRadius.lg,
  },
}))
