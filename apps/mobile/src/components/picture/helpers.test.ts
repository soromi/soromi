import { expect, test } from 'vitest'

import { fromBase64Text, toDataUri } from './helpers'

test('a drawing sent as base64 is read back as the text it was, accents and all', () => {
  const svg = '<svg><text>Café ✓</text></svg>'
  const sent = Buffer.from(svg, 'utf8').toString('base64')

  expect(fromBase64Text(sent)).toBe(svg)
})

test('an image is found where a decoder looks for one', () => {
  expect(toDataUri('image/png', 'iVBORw0')).toBe('data:image/png;base64,iVBORw0')
})
