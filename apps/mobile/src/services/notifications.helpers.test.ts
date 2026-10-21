import { expect, test } from 'vitest'

import { getBannerId, toData, toTarget } from './notifications.helpers'

const banner = { title: 'Soromi', body: '"kazomi" finished' }

test('a banner about a session is posted under that session, and leads back to it', () => {
  const about = { ...banner, session: 's1' }

  expect(getBannerId(about)).toBe('s1')
  expect(toTarget(toData(about))).toEqual({ session: 's1' })
})

test('a banner about no session shares one name, and leads nowhere', () => {
  expect(getBannerId(banner)).toBe('soromi')
  expect(toTarget(toData(banner))).toBeNull()
})

test('anything else that comes with a tapped banner leads nowhere', () => {
  expect(toTarget(undefined)).toBeNull()
  expect(toTarget(null)).toBeNull()
  expect(toTarget('s1')).toBeNull()
  expect(toTarget({ session: 7 })).toBeNull()
  expect(toTarget({ session: '' })).toBeNull()
})
