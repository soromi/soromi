import { ScrollView } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { AttachmentPreview } from './attachment'

//Type
import type { AttachmentsProps } from '../types'

/** The pictures going with the next message, in a row above what is written. */
export const Attachments = (props: AttachmentsProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
    >
      {props.attachments.map((attachment) => (
        <AttachmentPreview key={attachment.uri} session={props.session} attachment={attachment} />
      ))}
    </ScrollView>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: { gap: theme.spacing.xs },
}))
