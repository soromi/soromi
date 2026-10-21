import { repoKey } from '@soromi/core'

//State
import { create } from '../create'

//Helpers
import {
  getDiffKey,
  getFileKey,
  getParentPath,
  isWithin,
  withoutPaths,
} from './workspace.state.helpers'

//Type
import type { WorkspaceType } from './workspace.state.type'

/**
 * What the phone has looked at inside the computer's workspaces: folder listings, opened files,
 * git status and diffs. It is a cache of the daemon's answers, filled by the link as they arrive,
 * so coming back to a folder or a file shows it at once. It also holds which workspaces are folded
 * away in the session list, for as long as the app runs, and which of a workspace's terminals is
 * on screen.
 */
export const WorkspaceStore = create<WorkspaceType>()((set) => ({
  tree: { listings: {}, expanded: {} },
  files: { contents: {}, saves: {} },
  git: { status: {}, diffs: {}, folder: {}, repos: {} },
  groups: { collapsed: {} },
  renames: { to: {} },
  shells: { active: {} },
  browse: { listing: null },
  actions: {
    setCollapsed: (workspace, collapsed) =>
      set((state) => ({
        groups: { collapsed: { ...state.groups.collapsed, [workspace]: collapsed } },
      })),
    setListing: (workspace, path, entries) =>
      set((state) => ({
        tree: {
          ...state.tree,
          listings: {
            ...state.tree.listings,
            [workspace]: { ...state.tree.listings[workspace], [path]: entries },
          },
        },
      })),
    toggleDir: (workspace, path) =>
      set((state) => {
        const open = state.tree.expanded[workspace] ?? {}

        return {
          tree: {
            ...state.tree,
            expanded: { ...state.tree.expanded, [workspace]: { ...open, [path]: !open[path] } },
          },
        }
      }),
    forgetPath: (workspace, path) =>
      set((state) => {
        const parent = getParentPath(path)
        const gone = (candidate: string) => isWithin(candidate, path)

        return {
          tree: {
            // Without its listing, the folder the path was in is asked for again.
            listings: {
              ...state.tree.listings,
              [workspace]: withoutPaths(
                state.tree.listings[workspace],
                (candidate) => candidate === parent || gone(candidate),
              ),
            },
            expanded: {
              ...state.tree.expanded,
              [workspace]: withoutPaths(state.tree.expanded[workspace], gone),
            },
          },
        }
      }),
    setFile: (workspace, path, file) =>
      set((state) => ({
        files: {
          ...state.files,
          contents: { ...state.files.contents, [getFileKey(workspace, path)]: file },
        },
      })),
    startSave: (workspace, path, content) =>
      set((state) => ({
        files: {
          ...state.files,
          saves: {
            ...state.files.saves,
            [getFileKey(workspace, path)]: { state: 'saving', content },
          },
        },
      })),
    finishSave: (workspace, path) =>
      set((state) => {
        const key = getFileKey(workspace, path)
        const save = state.files.saves[key]
        if (save?.state !== 'saving') return state

        return {
          files: {
            contents: {
              ...state.files.contents,
              [key]: { content: save.content, truncated: false, binary: false },
            },
            saves: { ...state.files.saves, [key]: { ...save, state: 'saved' } },
          },
        }
      }),
    failSave: (workspace, path) =>
      set((state) => {
        const key = getFileKey(workspace, path)
        const save = state.files.saves[key]
        if (save?.state !== 'saving') return state

        return {
          files: {
            ...state.files,
            saves: { ...state.files.saves, [key]: { ...save, state: 'failed' } },
          },
        }
      }),
    setGitStatus: (workspace, folder, status, repos) =>
      set((state) => ({
        git: {
          ...state.git,
          status: { ...state.git.status, [repoKey(workspace, folder)]: status },
          repos: { ...state.git.repos, [workspace]: repos },
        },
      })),
    selectRepo: (workspace, folder) =>
      set((state) => ({
        git: { ...state.git, folder: { ...state.git.folder, [workspace]: folder } },
      })),
    setDiff: (workspace, folder, path, staged, diff) =>
      set((state) => ({
        git: {
          ...state.git,
          diffs: { ...state.git.diffs, [getDiffKey(workspace, folder, path, staged)]: diff },
        },
      })),
    setFolderListing: (listing) => set({ browse: { listing } }),
    setRenamed: (from, to) =>
      set((state) => ({ renames: { to: { ...state.renames.to, [from]: to } } })),
    selectShell: (workspace, id) =>
      set((state) => ({
        shells: { ...state.shells, active: { ...state.shells.active, [workspace]: id } },
      })),
  },
}))
