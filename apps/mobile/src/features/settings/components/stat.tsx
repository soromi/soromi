import { View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { StatProps } from '../types'

/** One figure about the link: what it is, and its value at the right. */
export const Stat = ({ tone = 'body', ...props }: StatProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.row}>
      <Text variant="bodySm" tone="muted">
        {props.label}
      </Text>
      <Text variant="bodySm" tone={tone} style={styles.value}>
        {props.value}
      </Text>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md },
  value: { flexShrink: 1, textAlign: 'right' },
}))
