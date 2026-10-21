import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { FlatList, View } from 'react-native'

//Components
import { KeyboardView, ProviderMark, Segmented } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { Agents } from '@/features/chat/components/agents'
import { Approval } from '@/features/chat/components/approval'
import { Composer } from '@/features/chat/components/composer'
import { ContextBanner } from '@/features/chat/components/context'
import { LoadEarlier } from '@/features/chat/components/earlier'
import { ChatEmpty } from '@/features/chat/components/empty'
import { ChatRow } from '@/features/chat/components/row'
import { WorkingIndicator } from '@/features/chat/components/working'
import { ControlBar } from '@/features/layout/components/control-bar'
import { LinkBanner } from '@/features/layout/components/link-banner'
import { ScreenHeader } from '@/features/layout/components/screen-header'
import { PanelTabs } from '@/features/panel/components/tabs'
import { TerminalPane } from '@/features/terminal/components/pane'

//Constants
import { TERMINAL } from '@/features/terminal/constants/terminal'

//Helpers
import { getPanelHref, getRowKey, toRows } from '@/features/chat/helpers'
import { getHeaderActions } from '@/features/layout/helpers'

//Hooks
import { useAttach } from '@/features/chat/hooks/use-attach'
import { useChatFiles } from '@/features/chat/hooks/use-chat-files'
import { useTurnClock } from '@/features/chat/hooks/use-turn-clock'
import { useLayout } from '@/hooks/use-layout'

//Screens
import { PanelPane } from '@/screens/shared/panel-pane'

//State
import {
  useDaemonApprovals,
  useDaemonChat,
  useDaemonHasEarlier,
  useDaemonInControl,
  useDaemonSession,
  useDaemonStreaming,
} from '@/states/daemon/daemon.state.hook'
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { ChatRow as Row } from '@soromi/core'
import type { ListRenderItemInfo } from 'react-native'
import type { PanelView } from '@/features/panel/types'
import type { TerminalView } from '@/features/terminal/types'

/**
 * One session's conversation, drawn as the desktop draws it: messages, tool calls that open to
 * their output or diff (a long run of them folded into one line), and the agent's reasoning, live,
 * with a box to send the next message. The header has the session's files, skills, changes and
 * terminals as icons, each opening the panel there: a screen of its own on a phone, a pane beside
 * the conversation on a tablet.
 */
export const SessionScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const { id } = useLocalSearchParams<{ id: string }>()
  const session = useDaemonSession(id)
  const events = useDaemonChat(id)
  const streaming = useDaemonStreaming(id)
  const approvals = useDaemonApprovals(id)
  const hasEarlier = useDaemonHasEarlier(id)
  const inControl = useDaemonInControl()
  const online = useLinkOnline()
  const router = useRouter()
  const screen = useLayout()
  const wide = screen.wide
  // The panel as a pane beside the conversation, which is how a wide screen shows it: the view it
  // is on, or `null` while it is closed.
  const [panel, setPanel] = useState<PanelView | null>(null)
  // A session that runs in a terminal can be read as a conversation or used as the terminal it is.
  const [view, setView] = useState<TerminalView>(TERMINAL.initial)

  useAttach(id)
  useChatFiles(id)

  const chat = session?.mode === 'chat'
  const working = session?.status === 'thinking'
  const since = useTurnClock(id, working)
  const tokens = session?.context_tokens ?? null
  // A tool call waiting for an answer says more than "working" does.
  const waiting = (approvals?.length ?? 0) > 0
  const loaded = events?.length ?? 0
  const title = session?.title ?? session?.account ?? ''

  const rows = useMemo(() => toRows(events, streaming), [events, streaming])

  const handlePanel = useCallback(
    (view: PanelView) => {
      if (wide) setPanel(view)
      else router.push(getPanelHref(id, view))
    },
    [wide, router, id],
  )

  const handlePanelClose = useCallback(() => setPanel(null), [])

  const handleView = useCallback((next: string) => setView(next as TerminalView), [])

  const showsTerminal = session?.mode === 'terminal' && view === 'terminal'

  // On a phone the navigator's header: the title, the way back, and the panel's views, each
  // opening it there. On a wide screen the app draws the top row itself (see below), so that the
  // panel can open beside it on the same line.
  const options = useMemo(
    () => ({
      title,
      headerShown: !wide,
      ...getHeaderActions(() => <PanelTabs active={null} onSelect={handlePanel} />),
    }),
    [title, wide, handlePanel],
  )

  const agent = session?.agent
  // The title at the left with its provider's mark, as on the desktop, and the panel's views at
  // the right until the panel is up: then it has them itself, on this line.
  const header = useMemo(
    () =>
      wide ? (
        <ScreenHeader title={title} leading={agent ? <ProviderMark provider={agent} /> : null}>
          {!panel && <PanelTabs active={null} onSelect={handlePanel} />}
        </ScreenHeader>
      ) : null,
    [wide, title, agent, panel, handlePanel],
  )

  const renderItem = useCallback((info: ListRenderItemInfo<Row>) => <ChatRow row={info.item} />, [])

  // The far end of an inverted list is the top of the conversation.
  const earlier = useMemo(
    () => (hasEarlier ? <LoadEarlier session={id} loaded={loaded} /> : null),
    [hasEarlier, id, loaded],
  )

  // The near end of an inverted list is the bottom of the conversation.
  const status = useMemo(
    () => (working && !waiting ? <WorkingIndicator since={since} tokens={tokens} /> : null),
    [working, waiting, since, tokens],
  )

  return (
    <View style={styles.root}>
      <View style={styles.main}>
        {header}
        <KeyboardView style={styles.chat}>
          <Stack.Screen options={options} />
          <LinkBanner />
          <ControlBar />
          {session?.mode === 'terminal' && (
            <View style={styles.views}>
              <Segmented options={TERMINAL.views} value={view} onChange={handleView} />
            </View>
          )}
          {session?.mode === 'terminal' && view === 'terminal' && <TerminalPane session={id} />}
          <View style={[styles.column, showsTerminal && styles.hidden]}>
            {rows.length === 0 ? (
              // Kept out of the list: an inverted list draws its own empty state upside down.
              <View style={styles.empty}>
                <ChatEmpty chat={chat} />
                {status}
              </View>
            ) : (
              <FlatList
                inverted
                data={rows}
                keyExtractor={getRowKey}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={renderItem}
                ListHeaderComponent={status}
                ListFooterComponent={earlier}
              />
            )}
            <Agents session={id} agents={session?.subagents} enabled={inControl} />
            {session && chat && (
              <ContextBanner
                session={id}
                agent={session.agent}
                model={session.model ?? null}
                tokens={tokens}
                enabled={inControl && online && !working}
              />
            )}
            {approvals?.map((approval) => (
              <Approval key={approval.id} session={id} approval={approval} enabled={inControl} />
            ))}
            <Composer
              session={id}
              chat={chat}
              working={working}
              inControl={inControl}
              online={online}
            />
          </View>
        </KeyboardView>
      </View>
      {wide && panel && (
        <PanelPane
          session={id}
          view={panel}
          docked={screen.docked}
          onView={setPanel}
          onClose={handlePanelClose}
        />
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, flexDirection: 'row', backgroundColor: theme.surface.page },
  main: { flex: 1 },
  chat: { flex: 1 },
  // A conversation is read in a column: on a wide screen it stops growing and sits in the middle.
  column: { flex: 1, width: '100%', maxWidth: layout.column, alignSelf: 'center' },
  // The conversation keeps its place (and its scroll) behind the terminal.
  hidden: { display: 'none' },
  views: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    flexGrow: 1,
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
}))
