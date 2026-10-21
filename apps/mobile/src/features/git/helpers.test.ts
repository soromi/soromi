import { expect, test } from 'vitest'

import {
  getAheadBehind,
  getChangeLetter,
  getDiffHref,
  toRepoChoices,
  getLetterTone,
  toDiffItems,
  toSections,
} from './helpers'

//Type
import type { GitChange, GitStatusInfo } from '@soromi/protocol'

const change = (path: string, index: string, worktree: string): GitChange => ({
  path,
  index,
  worktree,
})

const status = (changes: GitChange[], ahead = 0, behind = 0): GitStatusInfo => ({
  isRepo: true,
  branch: 'main',
  ahead,
  behind,
  changes,
})

test('changes are listed under staged, changes and untracked, without the empty groups', () => {
  const sections = toSections(
    status([change('a.ts', 'M', ''), change('b.ts', 'A', 'M'), change('c.ts', '?', '?')]),
  )

  expect(
    sections.map((section) => [section.title, section.data.map((item) => item.change.path)]),
  ).toEqual([
    // Each heading says how many files it holds, as on the desktop.
    ['Staged · 2', ['a.ts', 'b.ts']],
    ['Changes · 1', ['b.ts']],
    ['Untracked · 1', ['c.ts']],
  ])
  expect(toSections(status([change('a.ts', '', 'M')])).map((section) => section.title)).toEqual([
    'Changes · 1',
  ])
  expect(toSections(status([]))).toEqual([])
})

test('a file in two groups is two rows with different keys, letters and diffs', () => {
  const [staged, unstaged] = toSections(status([change('src/b.ts', 'A', 'M')])).map(
    (section) => section.data[0],
  )
  if (!staged || !unstaged) throw new Error('expected both rows')

  expect(staged.key).not.toBe(unstaged.key)
  expect([getChangeLetter(staged), getChangeLetter(unstaged)]).toEqual(['A', 'M'])
  expect(getDiffHref('ws', 'api', staged)).toEqual({
    pathname: '/workspace/[name]/diff',
    params: { name: 'ws', folder: 'api', path: 'src/b.ts', staged: '1' },
  })
  expect(getDiffHref('ws', '', unstaged)).toMatchObject({ params: { folder: '', staged: '0' } })
})

test("a workspace's repositories are offered by their folder's name", () => {
  expect(toRepoChoices(['', 'apps/web'])).toEqual([
    { folder: '', label: 'root' },
    { folder: 'apps/web', label: 'web' },
  ])
})

test('an untracked file shows U, and status letters have their colours', () => {
  const [untracked] = toSections(status([change('new.ts', '?', '?')])).map((s) => s.data[0])
  if (!untracked) throw new Error('expected a row')

  expect(getChangeLetter(untracked)).toBe('U')
  expect(['A', 'D', 'M', 'R', 'C', 'U', 'T'].map(getLetterTone)).toEqual([
    'action',
    'danger',
    'warn',
    'info',
    'info',
    'muted',
    'muted',
  ])
})

test('ahead and behind are shown only when the branch is', () => {
  expect(getAheadBehind(status([], 2, 1))).toBe('↑2 ↓1')
  expect(getAheadBehind(status([], 0, 3))).toBe('↓3')
  expect(getAheadBehind(status([]))).toBe('')
})

test('a patch becomes keyed rows', () => {
  const items = toDiffItems('@@ -1 +1 @@\n-old\n+new')

  expect(items.map((item) => item.row.kind)).toEqual(['hunk', 'del', 'add'])
  expect(new Set(items.map((item) => item.key)).size).toBe(3)
})
