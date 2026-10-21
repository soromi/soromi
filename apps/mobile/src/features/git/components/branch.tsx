import { View } from 'react-native'

//Components
import { Icon, IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { GIT } from '../constants/git'

//Helpers
import { getAheadBehind } from '../helpers'

//Type
import type { BranchProps } from '../types'

/**
 * The branch the workspace is on, how far it is ahead of or behind what it tracks, and the way to
 * ask for the status again: the computer does not send it unasked.
 */
export const Branch = (props: BranchProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      <Icon name="git" size={15} />
      <Text variant="bodySmSemiBold" tone="body" numberOfLines={1} style={styles.name}>
        {props.status.branch ?? GIT.copy.detached}
      </Text>
      <Text variant="caption" tone="muted">
        {getAheadBehind(props.status)}
      </Text>
      <IconButton icon="refresh" size="sm" label={GIT.copy.refresh} onPress={props.onRefresh} />
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  name: { flex: 1 },
}))
