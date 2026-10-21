import { useCallback, useMemo, useState } from 'react'
import { Image, Pressable, View } from 'react-native'

//Components
import { PictureViewer } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { getImageUri } from '../helpers'

//Type
import type { OpenPictureProps } from '../types'

/**
 * A picture in the conversation (one sent with a message, or one a tool returned) that a tap opens
 * at full size, to zoom into. A plain shape holds its place until its bytes have arrived.
 */
export const OpenPicture = (props: OpenPictureProps) => {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const uri = getImageUri(props.file)
  const label = props.file.filename ?? CHAT.files.picture

  const source = useMemo(() => (uri ? { uri } : null), [uri])

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  const shape = props.size === 'tile' ? styles.tile : styles.panel

  if (!source || !uri) return <View style={shape} />

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={label}
        accessibilityHint={CHAT.files.open}
        onPress={handleOpen}
      >
        <Image
          source={source}
          resizeMode={props.size === 'tile' ? 'cover' : 'contain'}
          style={shape}
        />
      </Pressable>
      <PictureViewer visible={open} uri={uri} label={label} onClose={handleClose} />
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  tile: {
    width: CHAT.files.thumb,
    height: CHAT.files.thumb,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.surface.raised,
  },
  panel: {
    width: '100%',
    height: CHAT.files.result,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.surface.sunken,
  },
}))
