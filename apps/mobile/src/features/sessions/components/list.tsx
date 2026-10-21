import { useCallback, useMemo, useState } from 'react'
import { SectionList } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { SessionsEmpty } from './empty'
import { WorkspaceHeading } from './heading'
import { SessionMenu } from './menu'
import { NewSession } from './new-session'
import { SessionRow } from './row'

//Helpers
import { getSessionKey, toSections } from '../helpers'

//State
import { useDaemonReady, useDaemonWorkspaces } from '@/states/daemon/daemon.state.hook'
import { useLinkOnline } from '@/states/link/link.state.hook'
import { useWorkspaceCollapsed } from '@/states/workspace/workspace.state.hook'

//Type
import type { SessionSummary } from '@soromi/protocol'
import type { SectionListData, SectionListRenderItemInfo } from 'react-native'
import type { ListProps, SessionSection, SessionTarget } from '../types'

/**
 * Every workspace on the computer and its sessions, live: the phone's home, and a tablet's
 * sessions column. A workspace folds away at a tap on its name, an open one ends with the way to
 * start a new session, and a long press on a session offers its menu.
 */
export const SessionList = (props: ListProps) => {
  const styles = useThemedStyles(makeStyles)
  const online = useLinkOnline()
  const workspaces = useDaemonWorkspaces()
  const ready = useDaemonReady()
  const collapsed = useWorkspaceCollapsed()
  const active = props.active
  // The session that was long-pressed, while its menu is open.
  const [target, setTarget] = useState<SessionTarget | null>(null)

  const sections = useMemo(() => toSections(workspaces, collapsed), [workspaces, collapsed])

  const handleMenuClose = useCallback(() => setTarget(null), [])

  const renderItem = useCallback(
    (info: SectionListRenderItemInfo<SessionSummary, SessionSection>) => (
      <SessionRow
        session={info.item}
        peers={info.section.workspace.sessions}
        active={info.item.id === active}
        onMenu={setTarget}
      />
    ),
    [active],
  )

  const renderHeading = useCallback(
    (info: { section: SectionListData<SessionSummary, SessionSection> }) => (
      <WorkspaceHeading workspace={info.section.workspace} open={info.section.open} />
    ),
    [],
  )

  // Under an open workspace's sessions, the way to start another.
  const renderFooter = useCallback(
    (info: { section: SectionListData<SessionSummary, SessionSection> }) =>
      info.section.open ? <NewSession workspace={info.section.workspace} /> : null,
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
        renderSectionFooter={renderFooter}
        ListEmptyComponent={empty}
      />
      <SessionMenu target={target} onClose={handleMenuClose} />
    </>
  )
}

const makeStyles = defineStyles((theme) => ({
  list: { flexGrow: 1, paddingBottom: theme.spacing.xl },
}))
