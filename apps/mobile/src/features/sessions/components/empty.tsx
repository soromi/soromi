import { View } from 'react-native'

//Components
import { Loader, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { SESSIONS } from '../constants/sessions'

//Type
import type { EmptyProps } from '../types'

/** In place of the list: still loading, nothing on the computer, or nothing while offline. */
export const SessionsEmpty = (props: EmptyProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      {props.online && !props.ready ? (
        <Loader />
      ) : (
        <Text variant="bodySm" tone="muted" style={styles.message}>
          {props.online ? SESSIONS.empty.online : SESSIONS.empty.offline}
        </Text>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  message: { textAlign: 'center' },
}))
