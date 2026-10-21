import { View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { SectionProps } from '../types'

/** One group of settings: what it is about, over what can be set. */
export const SettingsSection = (props: SectionProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      <Text variant="label" tone="muted">
        {props.title}
      </Text>
      <View style={styles.body}>{props.children}</View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { gap: theme.spacing.sm },
  body: {
    gap: theme.spacing.sm2,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.surface.raised,
  },
}))
