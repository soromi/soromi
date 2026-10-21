//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { LabelProps } from '../types'

/** Over a part of the home or of a workspace's screen: what is listed under it. */
export const SectionLabel = (props: LabelProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <Text variant="label" tone="muted" style={styles.label}>
      {props.title}
    </Text>
  )
}

const makeStyles = defineStyles((theme) => ({
  label: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
}))
