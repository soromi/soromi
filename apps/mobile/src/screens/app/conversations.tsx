import { Stack, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { FlatList, View } from 'react-native'

//Components
import { Input, KeyboardView, Text } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { ConversationRow } from '@/features/conversations/components/conversation-row'
import { LinkBanner } from '@/features/layout/components/link-banner'

//Constants
import { CONVERSATIONS } from '@/features/conversations/constants/conversations'

//Helpers
import { getCaption, getConversationKey, getEmptyText } from '@/features/conversations/helpers'
import { getHeaderTitle } from '@/features/layout/helpers'

//Hooks
import { useConversations } from '@/features/conversations/hooks/use-conversations'
import { useResume } from '@/features/conversations/hooks/use-resume'
import { useOpenSession } from '@/features/sessions/hooks/use-open-session'

//State
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { PastConversation } from '@soromi/protocol'
import type { ListRenderItemInfo } from 'react-native'

/** No conversations, the same array every time. */
const NONE: PastConversation[] = []

/**
 * A workspace's earlier conversations: every one its agents kept on the computer for it, newest
 * first, found by anything said in them. A tap carries one on in a session, its history shown;
 * one a session already shows opens that session.
 */
export const ConversationsScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const params = useLocalSearchParams<{ name: string }>()
  const workspace = params.name
  const online = useLinkOnline()
  const open = useOpenSession()
  const [text, setText] = useState('')
  const found = useConversations(workspace, text)
  const resume = useResume(workspace, open)
  const list = found.list ?? NONE
  const searching = found.waiting && found.loaded

  // One moment for every row to count from, taken again as each list arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the list is when to take it.
  const now = useMemo(() => Math.floor(Date.now() / 1000), [list])

  const renderItem = useCallback(
    (info: ListRenderItemInfo<PastConversation>) => (
      <ConversationRow conversation={info.item} now={now} onSelect={resume} />
    ),
    [now, resume],
  )

  const empty = useMemo(() => {
    const message = !online
      ? CONVERSATIONS.offline
      : !found.loaded
        ? CONVERSATIONS.loading
        : found.waiting
          ? CONVERSATIONS.searching
          : getEmptyText(found.query)

    return (
      <Text variant="bodySm" tone="muted" style={styles.empty}>
        {message}
      </Text>
    )
  }, [online, found.loaded, found.waiting, found.query, styles])

  const options = useMemo(() => getHeaderTitle(CONVERSATIONS.title), [])

  return (
    <KeyboardView style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <View style={styles.column}>
        <View style={styles.search}>
          <Input
            value={text}
            placeholder={CONVERSATIONS.search}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onChangeText={setText}
          />
          <Text variant="caption" tone="muted">
            {searching ? CONVERSATIONS.searching : getCaption(found.query, list.length)}
          </Text>
        </View>
        <FlatList
          data={list}
          keyExtractor={getConversationKey}
          renderItem={renderItem}
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          style={searching && styles.dim}
        />
      </View>
    </KeyboardView>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  // Read in a column: on a wide screen it stops growing and sits in the middle.
  column: { flex: 1, width: '100%', maxWidth: layout.column, alignSelf: 'center' },
  search: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  list: { flexGrow: 1, paddingBottom: theme.spacing.xl },
  // An answer to an older search, while the one asked for is on its way.
  dim: { opacity: 0.6 },
  empty: { padding: theme.spacing.lg, textAlign: 'center' },
}))
