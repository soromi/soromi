import { Stack, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { FlatList, View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { layout } from '@/config/layout'
import { defineStyles, useThemedStyles } from '@/config/theme'

//Features
import { AgentLogNote } from '@/features/chat/components/agent-log-note'
import { ChatRow } from '@/features/chat/components/row'
import { WorkingIndicator } from '@/features/chat/components/working'
import { LinkBanner } from '@/features/layout/components/link-banner'

//Constants
import { CHAT } from '@/features/chat/constants/chat'

//Helpers
import { getRowKey, toRows } from '@/features/chat/helpers'
import { getHeaderTitle } from '@/features/layout/helpers'

//Hooks
import { useAgentLog } from '@/features/chat/hooks/use-agent-log'

//Type
import type { ChatRow as Row } from '@soromi/core'
import type { ListRenderItemInfo } from 'react-native'

/**
 * A background agent's own work, read-only: what it was asked, the tools it used and what it
 * said, drawn as a conversation is, and followed live while it works.
 */
export const AgentScreen = () => {
  const styles = useThemedStyles(makeStyles)
  const params = useLocalSearchParams<{ id: string; agent: string; name?: string }>()
  const session = params.id
  const agent = params.agent
  const { log, running, since } = useAgentLog(session, agent)

  const rows = useMemo(() => toRows(log?.events, ''), [log?.events])
  const options = useMemo(() => getHeaderTitle(params.name ?? ''), [params.name])

  const renderItem = useCallback((info: ListRenderItemInfo<Row>) => <ChatRow row={info.item} />, [])

  // The near end of the inverted list is the bottom of the log; the far end, its top.
  const working = useMemo(
    () => (running ? <WorkingIndicator since={since} tokens={null} /> : null),
    [running, since],
  )
  const earlier = useMemo(
    () =>
      log?.earlier ? (
        <Text variant="caption" tone="muted" style={styles.earlier}>
          {CHAT.agents.log.earlier}
        </Text>
      ) : null,
    [log?.earlier, styles],
  )

  return (
    <View style={styles.root}>
      <Stack.Screen options={options} />
      <LinkBanner />
      <View style={styles.column}>
        <Text variant="caption" tone="muted" style={styles.state}>
          {running ? CHAT.agents.log.running : CHAT.agents.log.finished}
        </Text>
        {rows.length === 0 ? (
          <AgentLogNote loaded={log?.loaded ?? false} running={running} />
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={getRowKey}
            contentContainerStyle={styles.list}
            renderItem={renderItem}
            ListHeaderComponent={working}
            ListFooterComponent={earlier}
          />
        )}
      </View>
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.page },
  // Read in a column: on a wide screen it stops growing and sits in the middle.
  column: { flex: 1, width: '100%', maxWidth: layout.column, alignSelf: 'center' },
  state: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
  earlier: { textAlign: 'center', paddingVertical: theme.spacing.sm },
  list: {
    flexGrow: 1,
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
}))
