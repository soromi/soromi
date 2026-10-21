import { memo } from 'react'
import { View } from 'react-native'

//Components
import { Highlight, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { LineProps } from '../types'

/** One line of a file: its number, then its text in colour, wrapped if it is longer than the screen. */
export const Line = memo((props: LineProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.line}>
      <Text variant="mono" tone="muted" style={styles.number}>
        {props.line.number}
      </Text>
      <Text variant="mono" tone="body" selectable style={styles.text}>
        {props.line.tokens ? (
          <Highlight tokens={props.line.tokens} palette="file" />
        ) : (
          props.line.text
        )}
      </Text>
    </View>
  )
})

const makeStyles = defineStyles((theme) => ({
  line: { flexDirection: 'row', gap: theme.spacing.sm2, paddingHorizontal: theme.spacing.sm2 },
  // Room for four digits.
  number: { minWidth: 34, textAlign: 'right' },
  text: { flex: 1 },
}))
