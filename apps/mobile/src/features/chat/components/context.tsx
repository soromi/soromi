import { contextPercent, isContextFilling } from '@soromi/core'
import { useCallback, useState } from 'react'
import { Alert, View } from 'react-native'

//Components
import { Button, IconButton, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { getContextMessage } from '../helpers'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonContextLimit } from '@/states/daemon/daemon.state.hook'

//Type
import type { ContextProps } from '../types'

/**
 * A warning above the message box once the conversation fills most of the model's context window,
 * with the two ways out: compact it (summarise, to free space) or clear it (start over, after
 * asking). It can be put away; the agent compacts on its own when the window is full.
 */
export const ContextBanner = (props: ContextProps) => {
  const styles = useThemedStyles(makeStyles)
  const limit = useDaemonContextLimit(props.agent, props.model)
  const [dismissed, setDismissed] = useState(false)
  const session = props.session

  const handleCompact = useCallback(
    () =>
      LinkService.send({ type: 'chat-command', session, command: CHAT.context.commands.compact }),
    [session],
  )

  const handleClear = useCallback(
    () =>
      Alert.alert(CHAT.context.confirm.title, CHAT.context.confirm.message, [
        { text: CHAT.context.confirm.cancel, style: 'cancel' },
        {
          text: CHAT.context.confirm.confirm,
          style: 'destructive',
          onPress: () =>
            LinkService.send({
              type: 'chat-command',
              session,
              command: CHAT.context.commands.clear,
            }),
        },
      ]),
    [session],
  )

  const handleDismiss = useCallback(() => setDismissed(true), [])

  if (dismissed || props.tokens === null || !isContextFilling(props.tokens, limit)) return null

  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <View style={styles.head}>
          <Text variant="bodySm" tone="body" style={styles.message}>
            {getContextMessage(contextPercent(props.tokens, limit))}
          </Text>
          <IconButton icon="close" size="sm" label={CHAT.context.dismiss} onPress={handleDismiss} />
        </View>
        <View style={styles.actions}>
          <Button
            size="sm"
            variant="warn"
            label={CHAT.context.compact}
            disabled={!props.enabled}
            onPress={handleCompact}
          />
          <Button
            size="sm"
            variant="secondary"
            label={CHAT.context.clear}
            disabled={!props.enabled}
            onPress={handleClear}
          />
        </View>
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { paddingHorizontal: theme.spacing.sm2, paddingTop: theme.spacing.sm },
  banner: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.warn,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.surface.raised,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  message: { flex: 1 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
}))
