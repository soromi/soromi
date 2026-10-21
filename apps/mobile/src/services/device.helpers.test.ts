import { expect, test } from 'vitest'

import { toDeviceName } from './device.helpers'

test('a device is called what its owner named it', () => {
  expect(toDeviceName("Juan's Pixel", 'Pixel 9 Pro')).toBe("Juan's Pixel")
  expect(toDeviceName('  Work phone ', 'Pixel 9 Pro')).toBe('Work phone')
})

test('a name that only says the kind of device gives way to the model', () => {
  expect(toDeviceName('iPhone', 'iPhone 16 Pro')).toBe('iPhone 16 Pro')
  expect(toDeviceName('iPad', 'iPad Air (M2)')).toBe('iPad Air (M2)')
  // With no model to say more, the kind is better than nothing.
  expect(toDeviceName('iPhone', null)).toBe('iPhone')
})

test('a device with no name is called by its model, or a phone', () => {
  expect(toDeviceName(null, 'Pixel 9 Pro')).toBe('Pixel 9 Pro')
  expect(toDeviceName('', '')).toBe('Phone')
  expect(toDeviceName(null, null)).toBe('Phone')
})
