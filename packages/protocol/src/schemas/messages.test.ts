import { describe, expect, it } from 'vitest'
import { ClientMessageSchema, ServerMessageSchema } from './messages'

describe('ClientMessageSchema', () => {
  it('parses a valid attach message', () => {
    expect(ClientMessageSchema.safeParse({ type: 'attach', workspace: 'kazomi' }).success).toBe(
      true,
    )
  })

  it('rejects an unknown message type', () => {
    expect(ClientMessageSchema.safeParse({ type: 'nope' }).success).toBe(false)
  })

  it('rejects a resize with non-positive dimensions', () => {
    const msg = { type: 'resize', workspace: 'kazomi', cols: 0, rows: 24 }
    expect(ClientMessageSchema.safeParse(msg).success).toBe(false)
  })
})

describe('ServerMessageSchema', () => {
  it('parses a status message with a known status', () => {
    const msg = { type: 'status', workspace: 'kazomi', status: 'thinking' }
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true)
  })

  it('rejects a status message with an unknown status', () => {
    const msg = { type: 'status', workspace: 'kazomi', status: 'napping' }
    expect(ServerMessageSchema.safeParse(msg).success).toBe(false)
  })
})
