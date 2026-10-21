import { conversationAge, openTabOf } from '@soromi/core'
import { useCallback } from 'react'
import { Pressable, View } from 'react-native'

//Components
import { ProviderMark, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CONVERSATIONS } from '../constants/conversations'

//Type
import type { PressableStateCallbackType } from 'react-native'
import type { ConversationRowProps } from '../types'

/**
 * One earlier conversation: its name, the last thing asked in it, how long ago that was, and the
 * account it was had under (or that a session shows it already). A tap carries it on.
 */
export const ConversationRow = (props: ConversationRowProps) => {
  const styles = useThemedStyles(makeStyles)
  const conversation = props.conversation
  const onSelect = props.onSelect

  const handlePress = useCallback(() => onSelect(conversation), [onSelect, conversation])

  const getStyle = useCallback(
    (state: PressableStateCallbackType) => [styles.row, state.pressed && styles.pressed],
    [styles],
  )

  return (
    <Pressable accessibilityRole="button" style={getStyle} onPress={handlePress}>
      <ProviderMark provider={conversation.agent} size={18} />
      <View style={styles.text}>
        <Text variant="bodySemiBold" numberOfLines={1}>
          {conversation.title}
        </Text>
        {conversation.lastPrompt ? (
          <Text variant="bodySm" tone="muted" numberOfLines={1}>
            {conversation.lastPrompt}
          </Text>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text variant="caption" tone="muted">
          {conversationAge(conversation.updated, props.now)}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {openTabOf(conversation) ? CONVERSATIONS.open : conversation.account}
        </Text>
      </View>
    </Pressable>
  )
}

const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  pressed: { backgroundColor: theme.surface.raised },
  text: { flex: 1, gap: theme.spacing.xxs },
  meta: { alignItems: 'flex-end', gap: theme.spacing.xxs, maxWidth: 120 },
}))
