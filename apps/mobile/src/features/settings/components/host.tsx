import { View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Helpers
import { getHostDetail } from '../helpers'

//State
import { useDaemonHost, useDaemonVersion } from '@/states/daemon/daemon.state.hook'

//Constants
import { SETTINGS } from '../constants/settings'

/**
 * The computer the phone is paired with: its name, its system, and what runs Soromi on it (the
 * desktop app, or a terminal or service on a server). Nothing until the computer has said.
 */
export const ComputerHost = () => {
  const styles = useThemedStyles(makeStyles)
  const host = useDaemonHost()
  const version = useDaemonVersion()
  if (!host) return null

  return (
    <View style={styles.root}>
      <Text variant="bodySemiBold">{host.name}</Text>
      <Text variant="caption" tone="muted">
        {getHostDetail(host)}
      </Text>
      {version && (
        <Text variant="caption" tone="muted">
          {SETTINGS.computer.version(version)}
        </Text>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { gap: theme.spacing.xxs },
}))
