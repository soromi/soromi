import { expect, test } from 'vitest'

import { repoKey, repoLabel, repoToShow } from './repos'

test('a repository is called by its folder, and the root by that word', () => {
  expect(repoLabel('')).toBe('root')
  expect(repoLabel('api')).toBe('api')
  expect(repoLabel('apps/web')).toBe('web')
})

test('a root that is no repository gives way to the first one under it', () => {
  expect(repoToShow('', false, ['api', 'web'])).toBe('api')
})

test('what is shown stays when it is a repository, or when there is nothing else', () => {
  expect(repoToShow('', true, ['', 'vendor'])).toBeNull()
  expect(repoToShow('web', true, ['api', 'web'])).toBeNull()
  expect(repoToShow('', false, [])).toBeNull()
})

test('each folder of a workspace has its own state', () => {
  expect(repoKey('kazomi', '')).not.toBe(repoKey('kazomi', 'api'))
  expect(repoKey('kazomi', 'api')).toBe(repoKey('kazomi', 'api'))
})
