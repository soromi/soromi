import { useMemo } from 'react'
import { Image } from 'react-native'
import { SvgXml } from 'react-native-svg'

//Config
import { useThemedStyles } from '@/config/theme'

//Constants
import { PICTURE } from './constants'

//Helpers
import { fromBase64Text, toDataUri } from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { Props } from './types'

/**
 * A picture sent as base64, as large as the room it is given allows without being cut or
 * stretched. A drawing (SVG) is rendered; anything else is handed to the system's decoder, which
 * reads what the platform reads (PNG, JPEG, GIF, WebP, and more on iOS).
 */
export const Picture = (props: Props) => {
  const styles = useThemedStyles(makeStyles)
  const vector = props.mediaType === PICTURE.vector
  const data = props.data
  const mediaType = props.mediaType

  const xml = useMemo(() => (vector ? fromBase64Text(data) : null), [vector, data])
  const source = useMemo(() => ({ uri: toDataUri(mediaType, data) }), [mediaType, data])

  if (xml !== null) {
    return <SvgXml xml={xml} width="100%" height="100%" accessibilityLabel={props.label} />
  }

  return (
    <Image
      source={source}
      resizeMode="contain"
      accessibilityLabel={props.label}
      style={styles.picture}
    />
  )
}
