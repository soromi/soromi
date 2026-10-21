import { useCallback, useMemo } from 'react'
import { Image, View } from 'react-native'

//Components
import { Icon, IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//State
import { useChatActions } from '@/states/chat/chat.state.hook'

//Type
import type { AttachmentProps } from '../types'

/**
 * One picture or file going with the next message, with the way to take it back out. A file shows
 * as a tile with its name, as its contents are not a picture to show.
 */
export const AttachmentPreview = (props: AttachmentProps) => {
  const styles = useThemedStyles(makeStyles)
  const actions = useChatActions()
  const session = props.session
  const uri = props.attachment.uri
  const file = props.attachment.file
  const picture = file.mediaType.startsWith('image/')

  const source = useMemo(() => ({ uri }), [uri])

  const handleRemove = useCallback(
    () => actions.removeAttachment(session, uri),
    [actions, session, uri],
  )

  return (
    <View style={styles.root}>
      {picture ? (
        <Image source={source} style={styles.picture} />
      ) : (
        <View style={[styles.picture, styles.file]}>
          <Icon name="file-text" size={18} />
          <Text variant="caption" tone="muted" numberOfLines={2} style={styles.name}>
            {file.filename ?? CHAT.files.unnamed}
          </Text>
        </View>
      )}
      <View style={styles.remove}>
        <IconButton
          icon="close"
          size="sm"
          variant="secondary"
          label={CHAT.attach.remove}
          onPress={handleRemove}
        />
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    // Room for the button that sits over the picture's corner.
    paddingTop: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
  },
  picture: {
    width: CHAT.attach.thumb,
    height: CHAT.attach.thumb,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.surface.active,
  },
  file: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
  },
  name: { textAlign: 'center' },
  remove: { position: 'absolute', top: 0, right: 0 },
}))
