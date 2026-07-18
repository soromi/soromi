import { afterEach, beforeEach, expect, test } from 'vitest'
import { WebSocket } from 'ws'

import { config } from './config/app'
import { type Relay, createRelay } from './server'

let relay: Relay

beforeEach(async () => {
  relay = await createRelay({ port: 0, host: '127.0.0.1' })
})
afterEach(async () => {
  await relay.close()
})

const url = (room: string) => `ws://127.0.0.1:${relay.port}/?room=${room}`

/** Connects carrying the access key, so it may create the room (the daemon's role). */
const connect = (room: string) =>
  new WebSocket(url(room), { headers: { [config.accessHeader]: config.accessKey } })

/** Resolves once the socket is open. */
function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
}

/** Resolves with the next message, or rejects on close/timeout. */
function nextMessage(socket: WebSocket, ms = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms)
    socket.once('message', (data) => {
      clearTimeout(timer)
      resolve(data.toString())
    })
  })
}

/** Resolves with the close code. */
function closed(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)))
}

test('forwards frames between the two peers in a room', async () => {
  const a = connect('r1')
  const b = connect('r1')
  await Promise.all([opened(a), opened(b)])

  a.send('hello from a')
  expect(await nextMessage(b)).toBe('hello from a')

  b.send('hello from b')
  expect(await nextMessage(a)).toBe('hello from b')

  a.close()
  b.close()
})

test('does not leak frames across rooms', async () => {
  const a = connect('room-a')
  const other = connect('room-b')
  await Promise.all([opened(a), opened(other)])

  a.send('secret')
  await expect(nextMessage(other, 300)).rejects.toThrow('timed out')

  a.close()
  other.close()
})

test('refuses a third peer in a full room', async () => {
  const a = connect('full')
  const b = connect('full')
  await Promise.all([opened(a), opened(b)])

  const c = connect('full')
  expect(await closed(c)).toBe(4001)

  a.close()
  b.close()
})

test('refuses a connection with no room', async () => {
  const c = new WebSocket(`ws://127.0.0.1:${relay.port}/`)
  expect(await closed(c)).toBe(4000)
})

test('refuses creating a room without the access key', async () => {
  // No access header: an empty room cannot be created (only the daemon holds the key).
  const c = new WebSocket(url('gated'))
  expect(await closed(c)).toBe(4003)
})

test('lets a peer join an existing room without the access key', async () => {
  // The daemon creates the room with the key; the phone joins by room id, no key needed.
  const host = connect('shared')
  await opened(host)

  const phone = new WebSocket(url('shared'))
  await opened(phone)

  host.send('for the phone')
  expect(await nextMessage(phone)).toBe('for the phone')

  host.close()
  phone.close()
})
