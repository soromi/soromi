import { View } from 'react-native'

//Components
import { Text, WorkingMark } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Helpers
import { getWorkingMeta } from '../helpers'

//Hooks
import { useElapsed } from '../hooks/use-elapsed'
import { useWorkingWord } from '../hooks/use-working-word'

//Type
import type { WorkingProps } from '../types'

/**
 * Shown under the conversation while the agent works: a moving mark, a word that changes every few
 * seconds, how long the turn has run and how much context it has taken in. It keeps its own
 * timers, so their ticks redraw this line and nothing else.
 */
export const WorkingIndicator = (props: WorkingProps) => {
  const styles = useThemedStyles(makeStyles)
  const word = useWorkingWord()
  const elapsed = useElapsed(props.since)

  return (
    <View style={styles.root} accessibilityRole="progressbar">
      <WorkingMark />
      <Text variant="bodySm">{word}</Text>
      <Text variant="bodySm" tone="muted" style={styles.meta}>
        {getWorkingMeta(elapsed, props.tokens)}
      </Text>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  // Digits of one width, so the line does not shift as the clock ticks.
  meta: { flex: 1, fontVariant: ['tabular-nums'] },
}))
