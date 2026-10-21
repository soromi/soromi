import { useMemo } from 'react'
import { View } from 'react-native'

//Components
import { Icon, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { MessageImage } from './message-image'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { isImage } from '../helpers'

//Type
import type { MessageFilesProps } from '../types'

/** What was sent with a message: its pictures, drawn, and any other file as a line with its name. */
export const MessageFiles = (props: MessageFilesProps) => {
  const styles = useThemedStyles(makeStyles)
  const files = props.files

  const images = useMemo(() => files.filter(isImage), [files])
  const others = useMemo(() => files.filter((file) => !isImage(file)), [files])

  return (
    <View style={styles.root}>
      {images.length > 0 && (
        <View style={styles.images}>
          {images.map((file, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: attachments have no id of their own.
            <MessageImage key={index} file={file} />
          ))}
        </View>
      )}
      {others.map((file, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: attachments have no id of their own.
        <View key={index} style={styles.file}>
          <Icon name="file" size={15} />
          <Text variant="bodySm" tone="body" numberOfLines={1} style={styles.name}>
            {file.filename ?? CHAT.files.unnamed}
          </Text>
        </View>
      ))}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { gap: theme.spacing.sm },
  images: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  file: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  name: { flexShrink: 1 },
}))
