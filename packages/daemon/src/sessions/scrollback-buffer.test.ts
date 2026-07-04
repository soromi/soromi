import { describe, expect, it } from 'vitest'

//
import { ScrollbackBuffer } from './scrollback-buffer'

describe('ScrollbackBuffer', () => {
  it('returns everything while under the cap', () => {
    const buf = new ScrollbackBuffer(100)
    buf.append('hello ')
    buf.append('world')
    expect(buf.snapshot()).toBe('hello world')
  })

  it('drops whole leading chunks once over the cap', () => {
    const buf = new ScrollbackBuffer(10)
    buf.append('aaaaa')
    buf.append('bbbbb')
    buf.append('ccccc')
    // 'aaaaa' is dropped; the two most recent chunks fit the cap.
    expect(buf.snapshot()).toBe('bbbbbccccc')
  })

  it('trims a single oversized chunk to the cap, keeping the tail', () => {
    const buf = new ScrollbackBuffer(5)
    buf.append('0123456789')
    expect(buf.snapshot()).toBe('56789')
  })

  it('clears back to empty', () => {
    const buf = new ScrollbackBuffer(10)
    buf.append('data')
    buf.clear()
    expect(buf.snapshot()).toBe('')
  })
})
