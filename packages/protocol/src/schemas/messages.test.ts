import { describe, expect, it } from 'vitest'

//
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

  it('parses an open-workspace message', () => {
    expect(ClientMessageSchema.safeParse({ type: 'open-workspace', dir: '/w' }).success).toBe(true)
  })

  it('rejects open-workspace with an empty dir', () => {
    expect(ClientMessageSchema.safeParse({ type: 'open-workspace', dir: '' }).success).toBe(false)
  })

  it('parses a mute-workspace message', () => {
    const msg = { type: 'mute-workspace', workspace: 'kazomi', muted: true }
    expect(ClientMessageSchema.safeParse(msg).success).toBe(true)
  })

  it('parses a create-space message', () => {
    const msg = {
      type: 'create-space',
      name: 'k',
      root: '/w',
      agent: 'claude',
      account: 'personal',
    }
    expect(ClientMessageSchema.safeParse(msg).success).toBe(true)
  })

  it('parses a remove-space message', () => {
    expect(ClientMessageSchema.safeParse({ type: 'remove-space', workspace: 'k' }).success).toBe(
      true,
    )
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

  it('parses a workspace-opened message with an optional warning', () => {
    expect(
      ServerMessageSchema.safeParse({ type: 'workspace-opened', workspace: 'k' }).success,
    ).toBe(true)
    const withWarning = { type: 'workspace-opened', workspace: 'k', warning: 'no profile' }
    expect(ServerMessageSchema.safeParse(withWarning).success).toBe(true)
  })

  it('parses an error message', () => {
    expect(ServerMessageSchema.safeParse({ type: 'error', message: 'boom' }).success).toBe(true)
  })

  it('parses a workspace-list with full summaries', () => {
    const msg = {
      type: 'workspace-list',
      workspaces: [
        {
          name: 'kazomi',
          status: 'thinking',
          agent: 'claude',
          account: 'personal',
          folders: ['api'],
        },
      ],
    }
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true)
  })
})
