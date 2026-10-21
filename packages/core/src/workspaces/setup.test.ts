import { expect, test } from 'vitest'

import {
  accountChoices,
  boundAccounts,
  createSpaceMessage,
  updateSpaceMessage,
  workspaceFolderPaths,
} from './setup'

//Types
import type { AccountProfile, WorkspaceSummary } from '@soromi/protocol'

const profiles: AccountProfile[] = [
  { name: 'work', providers: { claude: { configDir: '~/.claude-work' } } },
  { name: 'codex-only', providers: { codex: {} } },
]

const workspace = (overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary => ({
  name: 'app',
  status: 'idle',
  root: '/code',
  folders: ['api', 'web'],
  accounts: [{ id: 'work', agent: 'claude' }],
  sessions: [],
  ...overrides,
})

test('a new workspace of one folder is that folder, whole, named after it', () => {
  expect(
    createSpaceMessage({ name: '', folders: ['/code/app/'], agent: 'claude', account: 'personal' }),
  ).toEqual({
    type: 'create-space',
    name: 'app',
    root: '/code/app',
    agent: 'claude',
    account: 'personal',
    folders: undefined,
  })
})

test('several folders share their common parent as the root', () => {
  const message = createSpaceMessage({
    name: 'mono',
    folders: ['/code/mono/api', '/code/mono/web'],
    agent: 'codex',
    account: 'personal',
  })
  expect(message).toMatchObject({ root: '/code/mono', folders: ['api', 'web'], name: 'mono' })
  expect(
    createSpaceMessage({ name: '', folders: [], agent: 'claude', account: 'personal' }),
  ).toBeNull()
})

test('an agent is offered the default account and the profiles that configure it', () => {
  expect(accountChoices(profiles, 'claude')).toEqual(['personal', 'work'])
  expect(accountChoices(profiles, 'grok')).toEqual(['personal'])
})

test('settings show a workspace as it is set up', () => {
  expect(workspaceFolderPaths(workspace({ folders: ['.'] }))).toEqual(['/code'])
  expect(workspaceFolderPaths(workspace())).toEqual(['/code/api', '/code/web'])
  expect(boundAccounts(workspace(), 'claude')).toEqual(['work'])
  expect(boundAccounts(workspace(), 'codex')).toEqual(['personal'])
})

test('saving keeps only the bindings an account can run, and a name only when it changed', () => {
  const message = updateSpaceMessage(
    workspace(),
    {
      name: 'app',
      folders: ['/code/api', '/code/web'],
      bindings: { claude: ['work'], codex: ['personal'], grok: ['personal'] },
      instructions: '  ',
    },
    profiles,
  )
  expect(message).toEqual({
    type: 'update-space',
    workspace: 'app',
    name: undefined,
    accounts: [{ id: 'work', agent: 'claude' }],
    folders: ['api', 'web'],
    root: '/code',
    instructions: undefined,
  })
  const renamed = updateSpaceMessage(
    workspace(),
    { name: 'billing', folders: ['/code/api'], bindings: {}, instructions: 'Be terse.' },
    profiles,
  )
  expect(renamed).toMatchObject({
    name: 'billing',
    root: '/code/api',
    folders: ['.'],
    instructions: 'Be terse.',
  })
})
