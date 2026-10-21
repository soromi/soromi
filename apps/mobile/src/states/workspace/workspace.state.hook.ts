import { repoKey } from '@soromi/core'

//Helpers
import { getDiffKey, getFileKey } from './workspace.state.helpers'

//State
import { WorkspaceStore } from './workspace.state'

/**
 * @description A workspace's folder listings, by folder path
 */
export const useWorkspaceListings = (workspace: string) =>
  WorkspaceStore((state) => state.tree.listings[workspace])

/**
 * @description Which of a workspace's folders are open
 */
export const useWorkspaceExpanded = (workspace: string) =>
  WorkspaceStore((state) => state.tree.expanded[workspace])

/**
 * @description A file's content, once the daemon has sent it
 */
export const useWorkspaceFile = (workspace: string, path: string) =>
  WorkspaceStore((state) => state.files.contents[getFileKey(workspace, path)])

/**
 * @description The last save of a file edited from here, or `undefined` if it never was
 */
export const useWorkspaceSave = (workspace: string, path: string) =>
  WorkspaceStore((state) => state.files.saves[getFileKey(workspace, path)])

/**
 * @description The folder whose repository a workspace's changes are shown for (`''` is its root)
 */
export const useWorkspaceRepo = (workspace: string) =>
  WorkspaceStore((state) => state.git.folder[workspace] ?? '')

/**
 * @description The folders of a workspace that are repositories, once the daemon has listed them
 */
export const useWorkspaceRepos = (workspace: string) =>
  WorkspaceStore((state) => state.git.repos[workspace])

/**
 * @description The git status of one of a workspace's repositories, once the daemon has sent it
 */
export const useWorkspaceGitStatus = (workspace: string, folder: string) =>
  WorkspaceStore((state) => state.git.status[repoKey(workspace, folder)])

/**
 * @description One file's diff, once the daemon has sent it
 */
export const useWorkspaceDiff = (
  workspace: string,
  folder: string,
  path: string,
  staged: boolean,
) => WorkspaceStore((state) => state.git.diffs[getDiffKey(workspace, folder, path, staged)])

/**
 * @description Which workspaces are folded away in the session list, by name
 */
export const useWorkspaceCollapsed = () => WorkspaceStore((state) => state.groups.collapsed)

/**
 * @description The computer's folder last listed for picking a workspace's folders
 */
export const useWorkspaceFolderListing = () => WorkspaceStore((state) => state.browse.listing)

/**
 * @description The id of the terminal on screen in a workspace, if one is
 */
export const useWorkspaceActiveShell = (workspace: string) =>
  WorkspaceStore((state) => state.shells.active[workspace])

/**
 * @description What a workspace renamed from this phone is called now; `undefined` for one that
 * was not
 */
export const useWorkspaceRenamedTo = (workspace: string) =>
  WorkspaceStore((state) => state.renames.to[workspace])

/**
 * @description Workspace actions: a stable reference, so no shallow compare needed
 */
export const useWorkspaceActions = () => WorkspaceStore((state) => state.actions)
