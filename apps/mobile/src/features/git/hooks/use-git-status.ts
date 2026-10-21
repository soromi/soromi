import { repoToShow } from '@soromi/core'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

//Constants
import { GIT } from '../constants/git'

//Services
import { LinkService } from '@/services/link'

//State
import {
  useWorkspaceActions,
  useWorkspaceGitStatus,
  useWorkspaceRepo,
  useWorkspaceRepos,
} from '@/states/workspace/workspace.state.hook'

/**
 * The git status of the repository a workspace's changes are shown for. A workspace can hold
 * several (its root, the folders it is made of, the directories right under the root): the daemon
 * lists them with each status, `select` shows another, and a root that is no repository gives way
 * to the first of them.
 *
 * The daemon does not push a status, so it is asked for: each time the list comes into view,
 * whenever the link comes back, when another repository is picked, and by `refresh`. `refreshing` is true from a
 * refresh until the answer (or until it has clearly not come).
 */
export const useGitStatus = (workspace: string) => {
  const actions = useWorkspaceActions()
  const folder = useWorkspaceRepo(workspace)
  const repos = useWorkspaceRepos(workspace)
  const status = useWorkspaceGitStatus(workspace, folder)
  const [refreshing, setRefreshing] = useState(false)

  const ask = useCallback(
    () => LinkService.send({ type: 'git-status', workspace, folder }),
    [workspace, folder],
  )

  // Nothing to show at this folder, and the workspace has repositories elsewhere: show the first.
  const instead = status && repos ? repoToShow(folder, status.isRepo, repos) : null
  useEffect(() => {
    if (instead !== null) actions.selectRepo(workspace, instead)
  }, [instead, actions, workspace])

  const select = useCallback(
    (next: string) => actions.selectRepo(workspace, next),
    [actions, workspace],
  )

  // Each time the list comes into view: when it is first shown, and on the way back from a diff,
  // by when the agent may have changed more.
  useFocusEffect(ask)

  useEffect(() => LinkService.onOpen(ask), [ask])

  // An answer is a new status object.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the status is the signal, not an input.
  useEffect(() => setRefreshing(false), [status])

  useEffect(() => {
    if (!refreshing) return
    const timer = setTimeout(() => setRefreshing(false), GIT.refreshMs)

    return () => clearTimeout(timer)
  }, [refreshing])

  const refresh = useCallback(() => {
    setRefreshing(true)
    ask()
  }, [ask])

  return {
    // While it is giving way to another, there is nothing of this folder's worth showing.
    status: instead === null ? status : undefined,
    folder,
    repos,
    refreshing,
    refresh,
    select,
  }
}
