import { useMemo } from 'react'
import { View } from 'react-native'

//Components
import { StatusDot, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getTally } from '../helpers'

//Type
import type { TallyProps } from '../types'

/**
 * A workspace's sessions in a glance, which is all a folded one shows: how many are at work or
 * stuck, how many have finished, or that nothing is going on.
 */
export const WorkspaceTally = (props: TallyProps) => {
  const styles = useThemedStyles(makeStyles)
  const sessions = props.sessions
  const tally = useMemo(() => getTally(sessions), [sessions])

  if (tally.running === 0 && tally.review === 0) {
    return (
      <Text variant="caption" tone="muted">
        {SESSIONS.tally.idle}
      </Text>
    )
  }

  return (
    <View style={styles.root}>
      {tally.running > 0 && (
        <View style={styles.count}>
          <StatusDot status="thinking" />
          <Text variant="captionSemiBold" tone="warn">
            {tally.running}
          </Text>
        </View>
      )}
      {tally.review > 0 && (
        <View style={styles.count}>
          <StatusDot status="done" />
          <Text variant="captionSemiBold" tone="action">
            {tally.review}
          </Text>
        </View>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.surface.raised,
  },
}))
