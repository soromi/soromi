import { expect, test } from 'vitest'

import { groupChanges, splitPath } from './changes'

//Types
import type { GitChange } from '@soromi/protocol'

const change = (path: string, index: string, worktree: string): GitChange => ({
  path,
  index,
  worktree,
})

test('changes are grouped by where they stand', () => {
  const groups = groupChanges([
    change('staged.ts', 'M', ''),
    change('edited.ts', '', 'M'),
    change('both.ts', 'A', 'M'),
    change('new.ts', '?', '?'),
  ])
  const paths = (list: GitChange[]) => list.map((item) => item.path)

  expect(paths(groups.staged)).toEqual(['staged.ts', 'both.ts'])
  expect(paths(groups.unstaged)).toEqual(['edited.ts', 'both.ts'])
  expect(paths(groups.untracked)).toEqual(['new.ts'])
})

test('a path splits into its name and its folder', () => {
  expect(splitPath('src/app/index.ts')).toEqual({ name: 'index.ts', dir: 'src/app' })
  expect(splitPath('README.md')).toEqual({ name: 'README.md', dir: '' })
})
