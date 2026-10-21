import { expect, test } from 'vitest'

import { toDocumentType } from './documents.helpers'

test('a PDF or a picture is sent as itself', () => {
  expect(toDocumentType('spec.pdf', 'application/pdf')).toBe('application/pdf')
  expect(toDocumentType('shot.png', 'image/png')).toBe('image/png')
})

test('text is sent as text, by its type or by its name', () => {
  expect(toDocumentType('notes.md', 'text/markdown')).toBe('text/markdown')
  expect(toDocumentType('data.json', 'application/json')).toBe('text/plain')
  expect(toDocumentType('main.rs', 'application/octet-stream')).toBe('text/plain')
  expect(toDocumentType('page.ts', 'video/mp2t')).toBe('text/plain')
  expect(toDocumentType('.env', undefined)).toBe('text/plain')
})

test('anything else is not something the agent reads', () => {
  expect(toDocumentType('song.mp3', 'audio/mpeg')).toBeNull()
  expect(toDocumentType('archive.zip', 'application/zip')).toBeNull()
  expect(toDocumentType('blob', undefined)).toBeNull()
})
