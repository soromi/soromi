import { useMemo } from 'react'
import { View } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { SessionCard } from './card'

//Helpers
import { getSessionKey } from '../helpers'

//Type
import type { CardRowProps } from '../types'

/** One row of the grid. A row that is not full keeps its cards the width of the others. */
export const CardRow = (props: CardRowProps) => {
  const styles = useThemedStyles(makeStyles)
  const missing = props.columns - props.sessions.length

  // What a full row would have in the places this one leaves empty.
  const spacers = useMemo(
    () => Array.from({ length: Math.max(0, missing) }, (_, index) => `spacer-${index}`),
    [missing],
  )

  return (
    <View style={styles.row}>
      {props.sessions.map((session) => (
        <SessionCard
          key={getSessionKey(session)}
          session={session}
          peers={props.peers}
          now={props.now}
          onMenu={props.onMenu}
        />
      ))}
      {spacers.map((spacer) => (
        <View key={spacer} style={styles.spacer} />
      ))}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm2,
  },
  spacer: { flex: 1 },
}))
