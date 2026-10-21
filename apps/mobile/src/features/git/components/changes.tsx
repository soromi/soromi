import { useCallback, useMemo } from 'react'
import { RefreshControl, SectionList, View } from 'react-native'

//Components
import { Loader, Text } from '@/components'

//Config
import { defineStyles, useTheme, useThemedStyles } from '@/config/theme'

//Components
import { Branch } from './branch'
import { ChangeRow } from './change-row'
import { SectionHeading } from './heading'
import { RepoPicker } from './repo-picker'

//Constants
import { GIT } from '../constants/git'

//Helpers
import { getChangeKey, toSections } from '../helpers'

//Hooks
import { useGitStatus } from '../hooks/use-git-status'

//Type
import type { SectionListData, SectionListRenderItemInfo } from 'react-native'
import type { ChangeItem, ChangeSection, ChangesProps } from '../types'

/**
 * A workspace's uncommitted work, read-only: which of its repositories is shown (when it holds
 * more than one), the branch, then the changed files grouped as staged, changed and untracked. It is asked for afresh each time the list comes into view, on the
 * refresh button, and on a pull down; tap a file for its diff.
 */
export const Changes = (props: ChangesProps) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const workspace = props.workspace
  const git = useGitStatus(workspace)
  const status = git.status
  const folder = git.folder

  const sections = useMemo(() => (status?.isRepo ? toSections(status) : []), [status])

  const renderItem = useCallback(
    (info: SectionListRenderItemInfo<ChangeItem, ChangeSection>) => (
      <ChangeRow workspace={workspace} folder={folder} item={info.item} />
    ),
    [workspace, folder],
  )

  const renderHeading = useCallback(
    (info: { section: SectionListData<ChangeItem, ChangeSection> }) => (
      <SectionHeading title={info.section.title} />
    ),
    [],
  )

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={git.refreshing}
        tintColor={theme.text.muted}
        onRefresh={git.refresh}
      />
    ),
    [git.refreshing, git.refresh, theme],
  )

  const refresh = git.refresh
  const repos = git.repos
  const select = git.select
  // Above the branch, the way to the workspace's other repositories, when it has more than one.
  const header = useMemo(
    () => (
      <>
        {repos && repos.length > 1 && (
          <RepoPicker folder={folder} repos={repos} onSelect={select} />
        )}
        {status?.isRepo && <Branch status={status} onRefresh={refresh} />}
      </>
    ),
    [status, refresh, repos, folder, select],
  )

  const empty = useMemo(
    () => (
      <Text variant="bodySm" tone="muted" style={styles.message}>
        {status?.isRepo ? GIT.copy.clean : GIT.copy.notRepo}
      </Text>
    ),
    [status, styles],
  )

  if (status === undefined) {
    return (
      <View style={styles.center}>
        <Loader />
      </View>
    )
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={getChangeKey}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      refreshControl={refreshControl}
      renderItem={renderItem}
      renderSectionHeader={renderHeading}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
    />
  )
}

const makeStyles = defineStyles((theme) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 1, paddingBottom: theme.spacing.xl },
  message: { padding: theme.spacing.xl, textAlign: 'center' },
}))
