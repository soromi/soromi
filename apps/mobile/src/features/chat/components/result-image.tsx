import { useMemo } from 'react'
import { Image, View } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { getImageUri } from '../helpers'

//Type
import type { ResultImageProps } from '../types'

/**
 * A picture a tool returned (a screenshot it read, say), drawn large enough to look at: it is the
 * result, not an attachment. A plain panel holds its place until its bytes have arrived.
 */
export const ResultImage = (props: ResultImageProps) => {
  const styles = useThemedStyles(makeStyles)
  const uri = getImageUri(props.file)

  const source = useMemo(() => (uri ? { uri } : null), [uri])

  if (!source) return <View style={styles.picture} />

  return <Image source={source} resizeMode="contain" style={styles.picture} />
}

const makeStyles = defineStyles((theme) => ({
  picture: {
    width: '100%',
    height: CHAT.files.result,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.surface.sunken,
  },
}))
