import type { DirEntry, GitStatusInfo } from '@soromi/protocol'

/** A file as the daemon read it. */
export type FileContent = {
  content: string
  /** The file was larger than the daemon sends; this is its start. */
  truncated: boolean
  /** The file is not text; `content` is empty. */
  binary: boolean
}

/** One file's diff, as `git diff` printed it. */
export type DiffContent = {
  patch: string
  /** The diff was larger than the daemon sends; this is its start. */
  truncated: boolean
}

export type WorkspaceTree = {
  /** Folder listings, by workspace then by folder path (`''` is the root). */
  listings: Record<string, Record<string, DirEntry[]>>
  /** Which folders are open, by workspace then by folder path. */
  expanded: Record<string, Record<string, boolean>>
}

/** Where a save of a file stands. */
export type FileSave = {
  state: 'saving' | 'saved' | 'failed'
  /** What was sent to be written, which becomes the file's content once the computer confirms. */
  content: string
}

export type WorkspaceFiles = {
  /** Files that have been opened, by `getFileKey`. */
  contents: Record<string, FileContent>
  /** The last save of each file edited from here, by `getFileKey`. */
  saves: Record<string, FileSave>
}

export type WorkspaceGit = {
  /** Working-tree status per repository, by `repoKey(workspace, folder)`. */
  status: Record<string, GitStatusInfo>
  /** Diffs that have been opened, by `getDiffKey`. */
  diffs: Record<string, DiffContent>
  /** The folder whose repository is shown, by workspace. One not named shows its root (`''`). */
  folder: Record<string, string>
  /** The folders of each workspace that are repositories, as the computer last listed them. */
  repos: Record<string, string[]>
}

export type WorkspaceGroups = {
  /** Which workspaces are folded away in the session list, by name. One not named is open. */
  collapsed: Record<string, boolean>
}

/** A terminal opened from here in a workspace: a plain shell on the computer, with no agent. */
export type Shell = {
  /** Made here; the daemon knows the shell by it from then on. */
  id: string
  /** Where it starts, relative to the workspace (`''` is its root). */
  folder: string
  title: string
}

export type WorkspaceShells = {
  /** The terminals opened from here, by workspace, in the order they were opened. */
  lists: Record<string, Shell[]>
  /** The one on screen, by workspace. */
  active: Record<string, string>
}

export type WorkspaceActions = {
  /** Folds a workspace's sessions away in the list, or shows them again. */
  toggleGroup: (workspace: string) => void
  setListing: (workspace: string, path: string, entries: DirEntry[]) => void
  toggleDir: (workspace: string, path: string) => void
  setFile: (workspace: string, path: string, file: FileContent) => void
  /** A file's new content was sent to the computer to be written. */
  startSave: (workspace: string, path: string, content: string) => void
  /** The computer wrote it: what was sent is the file's content now. */
  finishSave: (workspace: string, path: string) => void
  /** It was not written, or no answer came. A save that is not under way is left alone. */
  failSave: (workspace: string, path: string) => void
  /** A repository's status, and with it the workspace's repositories. */
  setGitStatus: (workspace: string, folder: string, status: GitStatusInfo, repos: string[]) => void
  /** Shows another of the workspace's repositories. */
  selectRepo: (workspace: string, folder: string) => void
  setDiff: (
    workspace: string,
    folder: string,
    path: string,
    staged: boolean,
    diff: DiffContent,
  ) => void
  /** The terminals kept from the last time the app ran. */
  setShells: (lists: Record<string, Shell[]>) => void
  /** Adds a terminal to a workspace, puts it on screen, and returns it to be opened. */
  openShell: (workspace: string, folder: string) => Shell
  /** Forgets a terminal; the one beside it takes its place on screen. */
  closeShell: (workspace: string, id: string) => void
  selectShell: (workspace: string, id: string) => void
}

export type WorkspaceType = {
  tree: WorkspaceTree
  files: WorkspaceFiles
  git: WorkspaceGit
  groups: WorkspaceGroups
  shells: WorkspaceShells
  /** Grouped so the object stays reference-stable: `useWorkspaceActions` needs no shallow compare. */
  actions: WorkspaceActions
}
