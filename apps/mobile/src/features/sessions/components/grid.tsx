import { useCallback, useMemo, useState } from 'react'
import { SectionList } from 'react-native'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { CardRow } from './card-row'
import { SessionsEmpty } from './empty'
import { WorkspaceHeading } from './heading'
import { SessionMenu } from './menu'
import { NewSession } from './new-session'

//Helpers
import { getRowKey, toGridSections } from '../helpers'

//Hooks
import { useLayout } from '@/hooks/use-layout'

//State
import { useDaemonReady, useDaemonWorkspaces } from '@/states/daemon/daemon.state.hook'
import { useLinkOnline } from '@/states/link/link.state.hook'
import { useWorkspaceCollapsed } from '@/states/workspace/workspace.state.hook'

//Type
import type { SessionSummary } from '@soromi/protocol'
import type { SectionListData, SectionListRenderItemInfo } from 'react-native'
import type { GridSection, SessionTarget } from '../types'

/**
 * The home as a grid: every workspace on the computer with its sessions as cards side by side, as
 * many to a row as the screen has room for. Everything else is as in the list: a workspace folds
 * away at a tap on its name, an open one ends with the way to start a session, and a long press on
 * a session offers its menu.
 */
export const SessionGrid = () => {
  const styles = useThemedStyles(makeStyles)
  const online = useLinkOnline()
  const workspaces = useDaemonWorkspaces()
  const ready = useDaemonReady()
  const collapsed = useWorkspaceCollapsed()
  const columns = useLayout().columns
  // The session that was long-pressed, while its menu is open.
  const [target, setTarget] = useState<SessionTarget | null>(null)

  const sections = useMemo(
    () => toGridSections(workspaces, collapsed, columns),
    [workspaces, collapsed, columns],
  )

  const handleMenuClose = useCallback(() => setTarget(null), [])

  const renderItem = useCallback(
    (info: SectionListRenderItemInfo<SessionSummary[], GridSection>) => (
      <CardRow
        sessions={info.item}
        peers={info.section.workspace.sessions}
        columns={columns}
        onMenu={setTarget}
      />
    ),
    [columns],
  )

  const renderHeading = useCallback(
    (info: { section: SectionListData<SessionSummary[], GridSection> }) => (
      <WorkspaceHeading workspace={info.section.workspace} open={info.section.open} />
    ),
    [],
  )

  // Under an open workspace's sessions, the way to start another.
  const renderFooter = useCallback(
    (info: { section: SectionListData<SessionSummary[], GridSection> }) =>
      info.section.open ? <NewSession workspace={info.section.workspace} /> : null,
    [],
  )

  const empty = useMemo(() => <SessionsEmpty online={online} ready={ready} />, [online, ready])

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={getRowKey}
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
