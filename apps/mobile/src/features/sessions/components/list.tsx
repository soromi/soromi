import { useCallback, useMemo, useState } from 'react'
import { SectionList } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { SessionsEmpty } from './empty'
import { WorkspaceHeading } from './heading'
import { SessionMenu } from './menu'
import { SessionRow } from './row'
import { WorkspaceMenu } from './workspace-menu'

//Helpers
import { getSessionKey, toSections } from '../helpers'

//Hooks
import { useClock } from '@/hooks/use-clock'

//State
import { useDaemonReady, useDaemonWorkspaces } from '@/states/daemon/daemon.state.hook'
import { useLinkOnline } from '@/states/link/link.state.hook'
import { useWorkspaceCollapsed } from '@/states/workspace/workspace.state.hook'

//Type
import type { SessionSummary } from '@soromi/protocol'
import type { SectionListData, SectionListRenderItemInfo } from 'react-native'
import type { ListProps, SessionSection, SessionTarget } from '../types'

/**
 * Every workspace on the computer and its sessions, live: a wide screen's sessions column, as the
 * desktop's sidebar. A workspace folds away at a tap on its name, its heading starts a session
 * and offers the rest, and a long press on a session offers its menu.
 */
export const SessionList = (props: ListProps) => {
  const styles = useThemedStyles(makeStyles)
  const online = useLinkOnline()
  const workspaces = useDaemonWorkspaces()
  const ready = useDaemonReady()
  const collapsed = useWorkspaceCollapsed()
  const active = props.active
  const now = useClock()
  // The session that was long-pressed, while its menu is open.
  const [target, setTarget] = useState<SessionTarget | null>(null)
  // The workspace whose dots were tapped, while its menu is open.
  const [menu, setMenu] = useState<string | null>(null)

  const sections = useMemo(() => toSections(workspaces, collapsed), [workspaces, collapsed])

  const handleMenuClose = useCallback(() => setTarget(null), [])
  const handleWorkspaceMenuClose = useCallback(() => setMenu(null), [])

  const renderItem = useCallback(
    (info: SectionListRenderItemInfo<SessionSummary, SessionSection>) => (
      <SessionRow
        session={info.item}
        peers={info.section.workspace.sessions}
        active={info.item.id === active}
        now={now}
        onMenu={setTarget}
      />
    ),
    [active, now],
  )

  const renderHeading = useCallback(
    (info: { section: SectionListData<SessionSummary, SessionSection> }) => (
      <WorkspaceHeading
        workspace={info.section.workspace}
        open={info.section.open}
        onMore={setMenu}
      />
    ),
    [],
  )

  const empty = useMemo(() => <SessionsEmpty online={online} ready={ready} />, [online, ready])

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={getSessionKey}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
        renderSectionHeader={renderHeading}
        ListEmptyComponent={empty}
      />
      <SessionMenu target={target} onClose={handleMenuClose} />
      <WorkspaceMenu workspace={menu} onClose={handleWorkspaceMenuClose} />
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  list: { flexGrow: 1, paddingBottom: theme.spacing.xl },
}))
