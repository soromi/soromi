import { useCallback, useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

//Components
import { Input, Text } from '@/components'

//Config
import { defineStyles, useTheme, useThemedStyles } from '@/config/theme'

//Components
import { Attachments } from './attachments'
import { SlashMenu } from './slash-menu'
import { Toolbar } from './toolbar'

//Constants
import { CHAT } from '../constants/chat'

//Helpers
import { hasMessage } from '../helpers'

//Hooks
import { usePhotos } from '../hooks/use-photos'

//Services
import { LinkService } from '@/services/link'

//State
import { useChatActions, useChatDraft } from '@/states/chat/chat.state.hook'

//Type
import type { ComposerProps } from '../types'

/**
 * Where the next message is written and sent, as one card: the pictures going with it, the box,
 * and under it the model, permissions and account the agent runs with. Only the device in control
 * can change any of it; a session that runs in a terminal gets a note instead.
 */
export const Composer = (props: ComposerProps) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const session = props.session
  const draft = useChatDraft(session)
  const actions = useChatActions()
  const photos = usePhotos(session)
  const attachments = photos.attachments
  const pick = photos.pick
  const enabled = props.chat && props.inControl && props.online
  const filled = hasMessage(draft, attachments?.length ?? 0)

  // Clear of the home indicator, and never flush against the edge.
  const inset = useMemo(
    () => ({ paddingBottom: Math.max(insets.bottom, theme.spacing.sm2) }),
    [insets.bottom, theme],
  )

  const handleSend = useCallback(() => {
    if (!enabled || !filled) return
    const files = (attachments ?? []).map((one) => one.file)
    LinkService.send({ type: 'chat-turn', session, text: draft.trim(), files })
    actions.setDraft(session, '')
    actions.clearAttachments(session)
  }, [enabled, filled, attachments, draft, session, actions])

  const handleChange = useCallback(
    (text: string) => actions.setDraft(session, text),
    [actions, session],
  )

  const handleStop = useCallback(
    () => LinkService.send({ type: 'chat-interrupt', session }),
    [session],
  )

  const handleAttach = useCallback(() => void pick(), [pick])

  if (!props.chat) {
    return (
      <View style={[styles.root, inset]}>
        <Text variant="bodySm" tone="muted">
          {CHAT.composer.terminal}
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.root, inset]}>
      {enabled && <SlashMenu session={session} draft={draft} />}
      <View style={styles.card}>
        {attachments && attachments.length > 0 && (
          <Attachments session={session} attachments={attachments} />
        )}
        <Input
          bare
          style={styles.input}
          value={draft}
          onChangeText={handleChange}
          placeholder={props.inControl ? CHAT.composer.placeholder : CHAT.composer.watching}
          editable={enabled}
          multiline
        />
        <Toolbar
          session={session}
          enabled={enabled}
          working={props.working}
          filled={filled}
          onAttach={handleAttach}
          onSend={handleSend}
          onStop={handleStop}
        />
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: {
    paddingHorizontal: theme.spacing.sm2,
    paddingTop: theme.spacing.sm,
    backgroundColor: theme.surface.page,
  },
  card: {
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.sm2,
    paddingTop: theme.spacing.sm2,
    paddingBottom: theme.spacing.sm,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.surface.raised,
  },
  input: { minHeight: 44, maxHeight: CHAT.composer.maxHeight },
}))
