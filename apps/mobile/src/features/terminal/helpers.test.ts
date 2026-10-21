import { expect, test } from 'vitest'

import { getFolderChoices } from './helpers'

test('a workspace that is one whole folder offers only its top', () => {
  expect(getFolderChoices(['.'], 'root')).toEqual([{ folder: '', label: 'root' }])
  expect(getFolderChoices(undefined, 'root')).toEqual([{ folder: '', label: 'root' }])
})

test('each folder of a workspace is offered by its own name, after the top', () => {
  expect(getFolderChoices(['apps/mobile', 'crates'], 'root')).toEqual([
    { folder: '', label: 'root' },
    { folder: 'apps/mobile', label: 'mobile' },
    { folder: 'crates', label: 'crates' },
  ])
})
