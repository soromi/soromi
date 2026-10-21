//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Type
import type { SectionHeadingProps } from '../types'

/** The name of a group of changes, above its files. */
export const SectionHeading = (props: SectionHeadingProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <Text variant="label" tone="muted" style={styles.heading}>
      {props.title}
    </Text>
  )
}

const makeStyles = defineStyles((theme) => ({
  heading: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
}))
