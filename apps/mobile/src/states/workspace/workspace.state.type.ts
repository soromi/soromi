import type { DirEntry, GitStatusInfo, ServerMessage } from '@soromi/protocol'

/** A file as the daemon read it. */
export type FileContent = {
  content: string
  /** The file was larger than the daemon sends; this is its start. */
  truncated: boolean
  /** The file is not text; `content` is empty. */
  binary: boolean
  /** The file is a picture of this media type: `content` is its bytes in base64, empty when the
   * computer would not send one so large (`truncated`). */
  image?: string
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
  /**
   * Which workspaces were folded away in the session list (`true`) or opened (`false`), by name.
   * One not named is as it starts: the first workspace open, every other folded away.
   */
  collapsed: Record<string, boolean>
}

export type WorkspaceRenames = {
  /**
   * What workspaces renamed from this phone are called now, by the name they had: a screen opened
   * under the old name follows it to the new one.
   */
  to: Record<string, string>
}

export type WorkspaceShells = {
  /**
   * The terminal on screen, by workspace. The terminals themselves are the daemon's list
   * (`workspace.shells`), the same on every device; which one this phone shows is its own.
   */
  active: Record<string, string>
}

export type WorkspaceActions = {
  /** Folds a workspace's sessions away in the list (`true`), or shows them again (`false`). */
  setCollapsed: (workspace: string, collapsed: boolean) => void
  setListing: (workspace: string, path: string, entries: DirEntry[]) => void
  toggleDir: (workspace: string, path: string) => void
  /** A file or folder went to the computer's Trash: the tree lets go of it. */
  forgetPath: (workspace: string, path: string) => void
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
  selectShell: (workspace: string, id: string) => void
  /** The daemon listed one of the computer's folders. */
  setFolderListing: (listing: FolderListing) => void
  /** A workspace was renamed from here. */
  setRenamed: (from: string, to: string) => void
}

/** One of the computer's folders, as the daemon listed it for picking a workspace's folders. */
export type FolderListing = Omit<Extract<ServerMessage, { type: 'folder-listing' }>, 'type'>

export type WorkspaceBrowse = {
  /** The folder last listed, `null` until one is asked for. */
  listing: FolderListing | null
}

export type WorkspaceType = {
  tree: WorkspaceTree
  files: WorkspaceFiles
  git: WorkspaceGit
  groups: WorkspaceGroups
  renames: WorkspaceRenames
  shells: WorkspaceShells
  browse: WorkspaceBrowse
  /** Grouped so the object stays reference-stable: `useWorkspaceActions` needs no shallow compare. */
  actions: WorkspaceActions
}
