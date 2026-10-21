import { useCallback } from 'react'
import { View } from 'react-native'

//Components
import { IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { WORKSPACES } from '../constants/workspaces'

//Type
import type { AccountRowProps } from '../types'

/**
 * An account an agent is bound to, as a row of its card. The first is the one its sessions start
 * under, and says so; one can be taken off while the agent has others.
 */
export const AccountRow = (props: AccountRowProps) => {
  const styles = useThemedStyles(makeStyles)
  const onRemove = props.onRemove
  const agent = props.agent
  const account = props.account

  const handleRemove = useCallback(() => onRemove(agent, account), [onRemove, agent, account])

  return (
    <View style={styles.row}>
      <Text variant="body" numberOfLines={1} style={styles.name}>
        {account}
      </Text>
      {props.first && (
        <View style={styles.badge}>
          <Text variant="captionSemiBold" tone="muted">
            {WORKSPACES.settings.defaultAccount}
          </Text>
        </View>
      )}
      {props.removable && (
        <IconButton
          icon="close"
          size="sm"
          label={WORKSPACES.settings.removeAccount}
          onPress={handleRemove}
        />
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.control.md,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
  },
  name: { flex: 1 },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.surface.active,
  },
}))
