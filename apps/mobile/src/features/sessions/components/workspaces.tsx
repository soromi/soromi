import { useCallback, useMemo, useState } from 'react'
import { FlatList } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { AttentionList } from './attention'
import { SessionsEmpty } from './empty'
import { SectionLabel } from './label'
import { SessionMenu } from './menu'
import { WorkspaceRow } from './workspace-row'

//Constants
import { SESSIONS } from '../constants/sessions'

//Helpers
import { getAttention, getWorkspaceKey } from '../helpers'

//Hooks
import { useClock } from '@/hooks/use-clock'

//State
import { useDaemonReady, useDaemonWorkspaces } from '@/states/daemon/daemon.state.hook'
import { useLinkOnline } from '@/states/link/link.state.hook'

//Type
import type { WorkspaceSummary } from '@soromi/protocol'
import type { ListRenderItemInfo } from 'react-native'
import type { SessionTarget } from '../types'

/**
 * The phone's home: first what needs the person, from every workspace (a session stuck, waiting
 * for an answer or just finished), then the workspaces themselves, one row each. A workspace's
 * sessions, and what can be done in it, are on its own screen.
 */
export const WorkspaceList = () => {
  const styles = useThemedStyles(makeStyles)
  const online = useLinkOnline()
  const workspaces = useDaemonWorkspaces()
  const ready = useDaemonReady()
  const now = useClock()
  // The session that was long-pressed, while its menu is open.
  const [target, setTarget] = useState<SessionTarget | null>(null)

  const attention = useMemo(() => getAttention(workspaces), [workspaces])

  const handleMenuClose = useCallback(() => setTarget(null), [])

  const renderItem = useCallback(
    (info: ListRenderItemInfo<WorkspaceSummary>) => <WorkspaceRow workspace={info.item} />,
    [],
  )

  const header = useMemo(
    () =>
      workspaces.length > 0 ? (
        <>
          <AttentionList items={attention} now={now} onMenu={setTarget} />
          <SectionLabel title={SESSIONS.home.workspaces} />
        </>
      ) : null,
    [workspaces.length, attention, now],
  )

  const empty = useMemo(() => <SessionsEmpty online={online} ready={ready} />, [online, ready])

  return (
    <>
      <FlatList
        data={workspaces}
        keyExtractor={getWorkspaceKey}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
      />
      <SessionMenu target={target} onClose={handleMenuClose} />
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  list: { flexGrow: 1, paddingBottom: theme.spacing.xl },
}))
