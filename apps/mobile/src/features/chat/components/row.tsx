import { memo } from 'react'
import { View } from 'react-native'

//Components
import { Markdown, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { MessageFiles } from './message-files'
import { Reasoning } from './reasoning'
import { ToolCall } from './tool'
import { ToolGroup } from './tool-group'

//Helpers
import { getNoticeText } from '../helpers'

//Type
import type { RowProps } from '../types'

/**
 * One row of a conversation, the same rows the desktop draws: a message from either side, a tool
 * call or a folded run of them, the agent's reasoning, or a system marker. The agent's messages
 * are markdown; the user's are shown exactly as typed.
 *
 * Memoized on its row: a new message or a streaming update redraws only the row it touches.
 */
export const ChatRow = memo((props: RowProps) => {
  const styles = useThemedStyles(makeStyles)
  const row = props.row

  switch (row.kind) {
    case 'user':
      return (
        <View style={styles.user}>
          {row.files.length > 0 && <MessageFiles files={row.files} />}
          {row.text !== '' && <Text selectable>{row.text}</Text>}
        </View>
      )
    case 'assistant':
      return <Markdown text={row.text} />
    case 'tool':
      return <ToolCall tool={row.tool} />
    case 'tool-group':
      return <ToolGroup tools={row.tools} />
    case 'thinking':
      return <Reasoning text={row.text} />
    case 'notice':
      return (
        <View style={styles.notice}>
          <View style={styles.rule} />
          <Text variant="caption" tone="muted" style={styles.marker}>
            {getNoticeText(row.text)}
          </Text>
          <View style={styles.rule} />
        </View>
      )
    default:
      return null
  }
})

const makeStyles = defineStyles((theme) => ({
  user: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.surface.active,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm2,
  },
  marker: { flexShrink: 1, textAlign: 'center' },
  rule: { width: 28, height: theme.borderWidth.hairline, backgroundColor: theme.border.default },
}))
