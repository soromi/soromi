import type { DiffRow } from '@soromi/core'
import type { GitChange, GitStatusInfo } from '@soromi/protocol'

//Config
import type { TextTone } from '@/config/theme'

//Type
import type { DiffContent } from '@/states/workspace/workspace.state.type'

/** Which group of changes a file is listed under. */
export type ChangeGroup = 'staged' | 'unstaged' | 'untracked'

/** One changed file as a row: which group it is in decides its letter and which diff it opens. */
export type ChangeItem = {
  key: string
  change: GitChange
  group: ChangeGroup
}

export type ChangeSection = {
  /** The group's name with how many files it holds: "Staged · 2". */
  title: string
  data: ChangeItem[]
}

export type ChangesProps = {
  workspace: string
}

export type ChangeRowProps = {
  workspace: string
  /** The repository the file is in: a folder of the workspace, `''` for its root. */
  folder: string
  item: ChangeItem
}

export type BranchProps = {
  status: GitStatusInfo
  /** Asks the computer for the status again. */
  onRefresh: () => void
}

/** One of a workspace's repositories, as it is offered. */
export type RepoChoice = {
  folder: string
  label: string
}

export type RepoPickerProps = {
  /** The one shown. */
  folder: string
  repos: string[]
  onSelect: (folder: string) => void
}

export type SectionHeadingProps = {
  title: string
}

/** A diff row with a key, for a list. */
export type DiffItem = {
  key: string
  row: DiffRow
}

export type DiffProps = {
  diff: DiffContent
}

export type DiffRowProps = {
  row: DiffRow
}

export type GitConfig = {
  sections: Record<ChangeGroup, string>
  /** The letter shown for a file git does not track yet. */
  untracked: string
  /** A status letter's colour: added, deleted, modified, renamed or copied. Others are muted. */
  tones: Record<string, TextTone>
  copy: {
    detached: string
    notRepo: string
    clean: string
    noDiff: string
    binary: string
    truncated: string
    ahead: string
    behind: string
    /** Between a group's name and its count. */
    count: string
    /** What the refresh button does, for a screen reader. */
    refresh: string
    /** What the workspace's root is called among its repositories. */
    root: string
    /** Over the repositories to pick from. */
    pick: string
  }
  /** How long a refresh may show as running without an answer, in milliseconds. */
  refreshMs: number
}
