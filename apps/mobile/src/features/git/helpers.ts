import { groupChanges, parseDiff, repoLabel } from '@soromi/core'

//Config
import { routes } from '@/config/router'

//Constants
import { GIT } from './constants/git'

//Type
import type { GitChange, GitStatusInfo } from '@soromi/protocol'
import type { Href } from 'expo-router'
import type { TextTone } from '@/config/theme'
import type { ChangeGroup, ChangeItem, ChangeSection, DiffItem, RepoChoice } from './types'

const toItems = (changes: GitChange[], group: ChangeGroup): ChangeItem[] =>
  changes.map((change) => ({ key: `${group}:${change.path}`, change, group }))

/** A working tree's changes as list sections: staged, changed, untracked. Empty groups are left out. */
export const toSections = (status: GitStatusInfo): ChangeSection[] => {
  const groups = groupChanges(status.changes)
  const section = (group: ChangeGroup): ChangeSection => ({
    title: getSectionTitle(group, groups[group].length),
    data: toItems(groups[group], group),
  })

  return [section('staged'), section('unstaged'), section('untracked')].filter(
    (one) => one.data.length > 0,
  )
}

/** A group's heading: its name and how many files it holds, as the desktop writes it. */
export const getSectionTitle = (group: ChangeGroup, count: number): string =>
  `${GIT.sections[group]}${GIT.copy.count}${count}`

export const getChangeKey = (item: ChangeItem): string => item.key

/** The status letter a row shows: the index's when staged, the working tree's otherwise. */
export const getChangeLetter = (item: ChangeItem): string => {
  if (item.group === 'untracked') return GIT.untracked

  return item.group === 'staged' ? item.change.index : item.change.worktree
}

export const getLetterTone = (letter: string): TextTone => GIT.tones[letter] ?? 'muted'

/** "↑2 ↓1": how far the branch is ahead of and behind what it tracks; empty when level. */
export const getAheadBehind = (status: GitStatusInfo): string =>
  [
    status.ahead > 0 ? `${GIT.copy.ahead}${status.ahead}` : '',
    status.behind > 0 ? `${GIT.copy.behind}${status.behind}` : '',
  ]
    .filter(Boolean)
    .join(' ')

/** Where a changed file's diff is shown. */
export const getDiffHref = (workspace: string, folder: string, item: ChangeItem): Href => ({
  pathname: routes.app.diff,
  params: {
    name: workspace,
    folder,
    path: item.change.path,
    staged: item.group === 'staged' ? '1' : '0',
  },
})

/** A workspace's repositories as choices: each by its folder's name, the root by that word. */
export const toRepoChoices = (repos: string[]): RepoChoice[] =>
  repos.map((folder) => ({ folder, label: repoLabel(folder, GIT.copy.root) }))

/** A patch as list items. */
export const toDiffItems = (patch: string): DiffItem[] =>
  parseDiff(patch).map((row, index) => ({ key: `d${index}`, row }))

export const getDiffKey = (item: DiffItem): string => item.key
