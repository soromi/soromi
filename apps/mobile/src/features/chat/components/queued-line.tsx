import { useCallback } from 'react'
import { View } from 'react-native'

//Components
import { Button, Icon, IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Services
import { LinkService } from '@/services/link'

//Type
import type { QueuedLineProps } from '../types'

/**
 * One queued message: its start, the pictures that go with it, and the way to send it now (it then
 * steers the running turn) or take it out of the queue.
 */
export const QueuedLine = (props: QueuedLineProps) => {
  const styles = useThemedStyles(makeStyles)
  const session = props.session
  const id = props.turn.id
  const files = props.turn.files ?? 0

  const handleSend = useCallback(
    () => LinkService.send({ type: 'chat-unqueue', session, id, send: true }),
    [session, id],
  )

  const handleRemove = useCallback(
    () => LinkService.send({ type: 'chat-unqueue', session, id, send: false }),
    [session, id],
  )

  return (
    <View style={styles.row}>
      <Text variant="bodySm" numberOfLines={2} style={styles.text}>
        {props.turn.text || CHAT.queue.attachments}
      </Text>
      {files > 0 && (
        <View style={styles.files}>
          <Icon name="paperclip" size={12} tone="muted" />
          <Text variant="caption" tone="muted">
            {files}
          </Text>
        </View>
      )}
      <Button
        size="sm"
        variant="secondary"
        label={CHAT.queue.send}
        disabled={!props.enabled}
        onPress={handleSend}
      />
      <IconButton
        icon="close"
        size="sm"
        label={CHAT.queue.remove}
        disabled={!props.enabled}
        onPress={handleRemove}
      />
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  text: { flex: 1 },
  files: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs },
}))
