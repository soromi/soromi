import { View } from 'react-native'

//Components
import { Icon, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { QueuedLine } from './queued-line'

//Helpers
import { getQueueLabel } from '../helpers'

//Type
import type { QueueProps } from '../types'

/**
 * Above the message box while messages are queued: written while the agent worked, each goes out
 * as the next turn once the running one ends, in this order. The computer holds them, so the
 * desktop shows the same queue, and they go even with the phone put away.
 */
export const Queue = (props: QueueProps) => {
  const styles = useThemedStyles(makeStyles)
  const queued = props.queued
  const count = queued?.length ?? 0

  if (!queued || count === 0) return null

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.title}>
          <Icon name="clock" size={14} tone="muted" />
          <Text variant="caption" tone="muted" style={styles.label}>
            {getQueueLabel(count, props.paused)}
          </Text>
        </View>
        {queued.map((turn) => (
          <QueuedLine key={turn.id} session={props.session} turn={turn} enabled={props.enabled} />
        ))}
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { paddingHorizontal: theme.spacing.sm2, paddingTop: theme.spacing.sm },
  card: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    borderRadius: theme.borderRadius.lg,
  },
  title: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  label: { flex: 1 },
}))
