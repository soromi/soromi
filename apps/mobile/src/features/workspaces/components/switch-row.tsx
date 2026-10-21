import { View } from 'react-native'

//Components
import { Switch, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { SwitchRowProps } from '../types'

/** A row of a card that turns something on or off, with what it does under its name. */
export const SwitchRow = (props: SwitchRowProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="bodySemiBold">{props.label}</Text>
        {props.hint && (
          <Text variant="caption" tone="muted">
            {props.hint}
          </Text>
        )}
      </View>
      <Switch label={props.label} value={props.value} onChange={props.onChange} />
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: theme.control.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  text: { flex: 1, gap: theme.spacing.xxs },
}))
