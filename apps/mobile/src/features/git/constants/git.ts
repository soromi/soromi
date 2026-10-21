//Type
import type { GitConfig } from '../types'

export const GIT: GitConfig = {
  sections: {
    staged: 'Staged',
    unstaged: 'Changes',
    untracked: 'Untracked',
  },
  untracked: 'U',
  tones: {
    A: 'action',
    D: 'danger',
    M: 'warn',
    R: 'info',
    C: 'info',
  },
  copy: {
    detached: 'detached',
    notRepo: 'Not a git repository.',
    clean: 'No changes.',
    noDiff: 'No changes.',
    binary: 'Binary file. Not shown.',
    truncated: 'This is the start of a large diff; the rest was left out.',
    ahead: '↑',
    behind: '↓',
    count: ' · ',
    refresh: 'Refresh',
    root: 'root',
    pick: 'Repository',
  },
  refreshMs: 4000,
}
