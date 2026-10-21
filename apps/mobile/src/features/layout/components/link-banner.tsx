import { useCallback } from 'react'
import { View } from 'react-native'

//Components
import { Button, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { LINK } from '../constants/link'

//Services
import { LinkService } from '@/services/link'

//State
import { useLinkStatus } from '@/states/link/link.state.hook'

/** Says why the app is not talking to the computer, when it is not. Renders nothing while online. */
export const LinkBanner = () => {
  const styles = useThemedStyles(makeStyles)
  const status = useLinkStatus()

  const handleRetry = useCallback(() => LinkService.recheck(), [])

  if (status === 'online') return null
  const action = LINK.actions[status]

  return (
    <View style={styles.banner}>
      <Text variant="bodySm" tone="body" style={styles.message}>
        {LINK.messages[status]}
      </Text>
      {action && <Button variant="plain" label={action} onPress={handleRetry} />}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
    backgroundColor: theme.surface.raised,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.border.default,
  },
  message: { flex: 1 },
}))
