import { useCallback } from 'react'

//Components
import { Button } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Services
import { LinkService } from '@/services/link'

//Type
import type { EarlierProps } from '../types'

/** Asks the daemon for the page of messages before the ones loaded. */
export const LoadEarlier = (props: EarlierProps) => {
  const styles = useThemedStyles(makeStyles)
  const session = props.session
  const loaded = props.loaded

  const handlePress = useCallback(
    () => LinkService.send({ type: 'chat-load-earlier', session, loaded }),
    [session, loaded],
  )

  return (
    <Button variant="plain" label={CHAT.row.earlier} style={styles.button} onPress={handlePress} />
  )
}

const makeStyles = defineStyles((theme) => ({
  button: { alignSelf: 'center', paddingVertical: theme.spacing.sm2 },
}))
