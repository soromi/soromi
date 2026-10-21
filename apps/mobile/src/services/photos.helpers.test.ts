import { expect, test } from 'vitest'

import { toAttachment, toAttachments } from './photos.helpers'

test('a picked picture becomes a file for the agent, shown from where it is on the phone', () => {
  const attachment = toAttachment({
    uri: 'file:///cache/a.png',
    base64: 'AAAA',
    mimeType: 'image/png',
    fileName: 'a.png',
  })

  expect(attachment).toEqual({
    uri: 'file:///cache/a.png',
    file: { mediaType: 'image/png', data: 'AAAA', filename: 'a.png' },
  })
})

test('a picture with no type is taken to be a JPEG, and one with no name is sent without', () => {
  expect(toAttachment({ uri: 'file:///b', base64: 'BBBB', fileName: null })?.file).toEqual({
    mediaType: 'image/jpeg',
    data: 'BBBB',
  })
})

test('a picture that came without its bytes is left out', () => {
  const picked = [
    { uri: 'file:///c', base64: null },
    { uri: 'file:///d', base64: 'DDDD' },
  ]

  expect(toAttachments(picked).map((one) => one.uri)).toEqual(['file:///d'])
})
