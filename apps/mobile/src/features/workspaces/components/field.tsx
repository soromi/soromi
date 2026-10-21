import { View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { FieldProps } from '../types'

/**
 * One part of a workspace's setup, as a settings list has it: its name above, what it is set to,
 * and under that a line on what it does.
 */
export const Field = (props: FieldProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      <Text variant="label" tone="muted" style={styles.label}>
        {props.label}
      </Text>
      <View style={styles.body}>{props.children}</View>
      {props.hint && (
        <Text variant="caption" tone="muted" style={styles.hint}>
          {props.hint}
        </Text>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { gap: theme.spacing.sm },
  // In line with the text inside the cards below.
  label: { paddingHorizontal: theme.spacing.md },
  body: { gap: theme.spacing.sm2 },
  hint: { paddingHorizontal: theme.spacing.md },
}))
