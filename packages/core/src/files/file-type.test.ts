import { describe, expect, it } from 'vitest'

import { fileType } from './file-type'

describe('fileType', () => {
  it('goes by the extension, whatever its case', () => {
    expect(fileType('index.ts').kind).toBe('code')
    expect(fileType('NOTES.MD').kind).toBe('doc')
    expect(fileType('logo.png').kind).toBe('image')
    expect(fileType('index.ts').color).not.toBe(fileType('main.rs').color)
  })

  it('knows a few files by name, before their extension', () => {
    expect(fileType('Dockerfile').kind).toBe('code')
    expect(fileType('README').kind).toBe('doc')
    expect(fileType('.gitignore').kind).toBe('doc')
  })

  it('gives a lockfile the padlock, whatever its extension', () => {
    expect(fileType('pnpm-lock.yaml').kind).toBe('lock')
    expect(fileType('Cargo.lock').kind).toBe('lock')
    expect(fileType('config.yaml').kind).toBe('doc')
  })

  it('draws anything else as a plain page', () => {
    expect(fileType('Dockerfile.base').kind).toBe('page')
    expect(fileType('.npmrc').kind).toBe('page')
  })
})
