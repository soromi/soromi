import { useCallback, useMemo, useState } from 'react'
import { FlatList, View } from 'react-native'

//Components
import { Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { WorkspaceActions } from './actions'
import { CardRow } from './card-row'
import { SectionLabel } from './label'
import { SessionMenu } from './menu'
import { SessionRow } from './row'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getRowKey, getSessionKey, toCardRows } from '../helpers'

//Hooks
import { useClock } from '@/hooks/use-clock'
import { useLayout } from '@/hooks/use-layout'

//State
import { usePreferencesView } from '@/states/preferences/preferences.state.hook'

//Type
import type { SessionSummary } from '@soromi/protocol'
import type { ListRenderItemInfo } from 'react-native'
import type { SessionTarget, WorkspaceSessionsProps } from '../types'

/**
 * A workspace's screen: what can be done in it at the top (start a session, carry on an earlier
 * one, its usage), then its sessions, as rows or as cards, whichever the header's switch was last
 * left on. A long press on a session offers its menu.
 */
export const WorkspaceSessions = (props: WorkspaceSessionsProps) => {
  const styles = useThemedStyles(makeStyles)
  const view = usePreferencesView()
  const columns = useLayout().columns
  const now = useClock()
  const workspace = props.workspace
  const sessions = workspace.sessions
  // The session that was long-pressed, while its menu is open.
  const [target, setTarget] = useState<SessionTarget | null>(null)

  const rows = useMemo(() => toCardRows(sessions, columns), [sessions, columns])

  const handleMenuClose = useCallback(() => setTarget(null), [])

  const renderRow = useCallback(
    (info: ListRenderItemInfo<SessionSummary>) => (
      <SessionRow session={info.item} peers={sessions} now={now} flush onMenu={setTarget} />
    ),
    [sessions, now],
  )

  const renderCards = useCallback(
    (info: ListRenderItemInfo<SessionSummary[]>) => (
      <CardRow
        sessions={info.item}
        peers={sessions}
        columns={columns}
        now={now}
        onMenu={setTarget}
      />
    ),
    [sessions, columns, now],
  )

  const header = useMemo(
    () => (
      <>
        <View style={styles.actions}>
          <WorkspaceActions workspace={workspace} />
        </View>
        {sessions.length > 0 && <SectionLabel title={SESSIONS.workspace.sessions} />}
      </>
    ),
    [styles, workspace, sessions.length],
  )

  const empty = useMemo(
    () => (
      <Text variant="bodySm" tone="muted" style={styles.empty}>
        {SESSIONS.workspace.empty}
      </Text>
    ),
    [styles],
  )

  return (
    <>
      {view === 'grid' ? (
        <FlatList
          key="grid"
          data={rows}
          keyExtractor={getRowKey}
          contentContainerStyle={styles.list}
          renderItem={renderCards}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
        />
      ) : (
        <FlatList
          key="list"
          data={sessions}
          keyExtractor={getSessionKey}
          contentContainerStyle={styles.list}
          renderItem={renderRow}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
        />
      )}
      <SessionMenu target={target} onClose={handleMenuClose} />
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  list: { flexGrow: 1, paddingBottom: theme.spacing.xl },
  actions: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm2 },
  empty: { padding: theme.spacing.xl, textAlign: 'center' },
}))
