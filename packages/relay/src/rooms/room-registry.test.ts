import { expect, test } from 'vitest'
import type { WebSocket } from 'ws'

import { RoomRegistry } from './room-registry'

/** A minimal stand-in for a ws socket: records what it was sent, with a settable ready state. */
function fakeSocket(open = true) {
  const sent: string[] = []
  const socket = {
    OPEN: 1,
    readyState: open ? 1 : 3,
    send: (data: Buffer) => sent.push(data.toString()),
  }
  return { socket: socket as unknown as WebSocket, sent }
}

test('pairs two peers and refuses a third', () => {
  const registry = new RoomRegistry()
  expect(registry.join('r', fakeSocket().socket)).toBe('joined')
  expect(registry.join('r', fakeSocket().socket)).toBe('joined')
  expect(registry.join('r', fakeSocket().socket)).toBe('full')
  expect(registry.size('r')).toBe(2)
})

test('forwards to the other peer, not the sender, and only in the room', () => {
  const registry = new RoomRegistry()
  const a = fakeSocket()
  const b = fakeSocket()
  const elsewhere = fakeSocket()
  registry.join('r', a.socket)
  registry.join('r', b.socket)
  registry.join('other', elsewhere.socket)

  registry.forward('r', a.socket, Buffer.from('ping'), false)

  expect(b.sent).toEqual(['ping'])
  expect(a.sent).toEqual([]) // never echoed to the sender
  expect(elsewhere.sent).toEqual([]) // never crosses rooms
})

test('skips peers that are not open', () => {
  const registry = new RoomRegistry()
  const a = fakeSocket()
  const closed = fakeSocket(false)
  registry.join('r', a.socket)
  registry.join('r', closed.socket)

  registry.forward('r', a.socket, Buffer.from('x'), false)
  expect(closed.sent).toEqual([])
})

test('drops the room once empty', () => {
  const registry = new RoomRegistry()
  const a = fakeSocket()
  registry.join('r', a.socket)
  registry.leave('r', a.socket)
  expect(registry.size('r')).toBe(0)
})

test('announces the peer count to every peer as a presence frame', () => {
  const registry = new RoomRegistry()
  const a = fakeSocket()
  const b = fakeSocket()
  registry.join('r', a.socket)
  registry.join('r', b.socket)

  registry.announce('r')

  const frame = JSON.stringify({ __relay: 'presence', peers: 2 })
  expect(a.sent).toEqual([frame])
  expect(b.sent).toEqual([frame])
})
