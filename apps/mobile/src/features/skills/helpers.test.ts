import { expect, test } from 'vitest'

import { getSkillCommand, getSkillKey, getSkillOrigin } from './helpers'

//Type
import type { Skill } from '@soromi/protocol'

const recap: Skill = { name: 'recap', kind: 'command', scope: 'project' }
const review: Skill = { name: 'recap', kind: 'skill', scope: 'user' }

test('a skill is called with a slash, and says what it is and where it is from', () => {
  expect(getSkillCommand(recap)).toBe('/recap')
  expect(getSkillOrigin(recap)).toBe('Command · Project')
  expect(getSkillOrigin(review)).toBe('Skill · Yours')
})

test('a command and a skill of the same name are different rows', () => {
  expect(getSkillKey(recap)).not.toBe(getSkillKey(review))
})
