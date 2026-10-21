import { useMemo } from 'react'
import { Image, View } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { getImageUri } from '../helpers'

//Type
import type { MessageImageProps } from '../types'

/** A picture sent with a message. A plain tile stands in for it until its bytes have arrived. */
export const MessageImage = (props: MessageImageProps) => {
  const styles = useThemedStyles(makeStyles)
  const uri = getImageUri(props.file)

  const source = useMemo(() => (uri ? { uri } : null), [uri])

  if (!source) return <View style={styles.tile} />

  return <Image source={source} resizeMode="cover" style={styles.tile} />
}

const makeStyles = defineStyles((theme) => ({
  tile: {
    width: CHAT.files.thumb,
    height: CHAT.files.thumb,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.surface.raised,
  },
}))
