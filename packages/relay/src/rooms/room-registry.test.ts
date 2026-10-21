import { expect, test } from 'vitest'
import type { WebSocket } from 'ws'

import { config } from '../config/app'
import { RoomRegistry } from './room-registry'

/** A minimal stand-in for a ws socket: records what it was sent, with a settable ready state. */
function fakeSocket(open = true) {
  const sent: string[] = []
  const state = { terminated: false }
  const socket = {
    OPEN: 1,
    readyState: open ? 1 : 3,
    bufferedAmount: 0,
    send: (data: Buffer) => sent.push(data.toString()),
    terminate: () => {
      state.terminated = true
    },
  }
  return { socket: socket as unknown as WebSocket, sent, state, raw: socket }
}

test('a room holds one host and one device', () => {
  const registry = new RoomRegistry()
  expect(registry.hasHost('r')).toBe(false)
  registry.join('r', 'host', fakeSocket().socket)
  registry.join('r', 'device', fakeSocket().socket)
  expect(registry.hasHost('r')).toBe(true)
  expect(registry.size('r')).toBe(2)
})

test('evicting a role frees it for a new socket and hands back the old one', () => {
  const registry = new RoomRegistry()
  const host = fakeSocket()
  const stale = fakeSocket()
  const fresh = fakeSocket()
  registry.join('r', 'host', host.socket)
  expect(registry.evict('r', 'device')).toBeUndefined()
  registry.join('r', 'device', stale.socket)

  expect(registry.evict('r', 'device')).toBe(stale.socket)
  expect(registry.size('r')).toBe(1)
  registry.join('r', 'device', fresh.socket)
  expect(registry.size('r')).toBe(2)

  // The displaced socket is out of the room: it is sent nothing, and its late close changes nothing.
  registry.forward('r', host.socket, Buffer.from('ping'), false)
  expect(fresh.sent).toEqual(['ping'])
  expect(stale.sent).toEqual([])
  expect(registry.leave('r', stale.socket)).toBe(false)
  expect(registry.size('r')).toBe(2)
})

test('forwards to the other peer, not the sender, and only in the room', () => {
  const registry = new RoomRegistry()
  const a = fakeSocket()
  const b = fakeSocket()
  const elsewhere = fakeSocket()
  registry.join('r', 'host', a.socket)
  registry.join('r', 'device', b.socket)
  registry.join('other', 'device', elsewhere.socket)

  registry.forward('r', a.socket, Buffer.from('ping'), false)

  expect(b.sent).toEqual(['ping'])
  expect(a.sent).toEqual([]) // never echoed to the sender
  expect(elsewhere.sent).toEqual([]) // never crosses rooms
})

test('skips a peer that is not open', () => {
  const registry = new RoomRegistry()
  const a = fakeSocket()
  const closed = fakeSocket(false)
  registry.join('r', 'host', a.socket)
  registry.join('r', 'device', closed.socket)

  registry.forward('r', a.socket, Buffer.from('x'), false)
  expect(closed.sent).toEqual([])
})

test('drops a peer that is not draining instead of buffering for it', () => {
  const registry = new RoomRegistry()
  const host = fakeSocket()
  const slow = fakeSocket()
  registry.join('r', 'host', host.socket)
  registry.join('r', 'device', slow.socket)

  slow.raw.bufferedAmount = config.maxBufferedBytes
  registry.forward('r', host.socket, Buffer.from('fits'), false)
  expect(slow.sent).toEqual(['fits'])
  expect(slow.state.terminated).toBe(false)

  slow.raw.bufferedAmount = config.maxBufferedBytes + 1
  registry.forward('r', host.socket, Buffer.from('too much'), false)
  expect(slow.sent).toEqual(['fits'])
  expect(slow.state.terminated).toBe(true)
})

test('drops the room once empty', () => {
  const registry = new RoomRegistry()
  const a = fakeSocket()
  registry.join('r', 'host', a.socket)
  expect(registry.leave('r', a.socket)).toBe(true)
  expect(registry.size('r')).toBe(0)
  expect(registry.hasHost('r')).toBe(false)
})

test('announces the peer count to every peer as a presence frame', () => {
  const registry = new RoomRegistry()
  const a = fakeSocket()
  const b = fakeSocket()
  registry.join('r', 'host', a.socket)
  registry.join('r', 'device', b.socket)

  registry.announce('r')

  const frame = JSON.stringify({ __relay: 'presence', peers: 2 })
  expect(a.sent).toEqual([frame])
  expect(b.sent).toEqual([frame])
})
