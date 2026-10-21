import { afterEach, beforeEach, expect, test } from 'vitest'
import { WebSocket } from 'ws'

import { closeCode, config } from './config/app'
import { type Relay, createRelay } from './server'

const ACCESS_KEY = 'test-access-key'

let relay: Relay

beforeEach(async () => {
  relay = await createRelay({ port: 0, host: '127.0.0.1', accessKey: ACCESS_KEY })
})
afterEach(async () => {
  await relay.close()
})

const url = (room: string, role?: string) =>
  `ws://127.0.0.1:${relay.port}/?room=${room}${role ? `&role=${role}` : ''}`

/** Connects as the daemon: the host role, carrying the access key. */
const host = (room: string) =>
  new WebSocket(url(room, 'host'), { headers: { [config.accessHeader]: ACCESS_KEY } })

/** Connects as a paired phone: the device role, with no key. */
const device = (room: string) => new WebSocket(url(room, 'device'))

/** Resolves once the socket is open. */
function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
}

/**
 * Collects a socket's messages from the moment it is created, so none is missed between two awaits.
 * `next()` resolves with the next message that is not a presence frame, or rejects on timeout.
 */
function inbox(socket: WebSocket) {
  const waiting: string[] = []
  const presence: number[] = []
  let wake: (() => void) | null = null
  socket.on('message', (data) => {
    const text = data.toString()
    if (text.includes('"__relay"')) presence.push(JSON.parse(text).peers)
    else waiting.push(text)
    wake?.()
  })

  const until = async (ready: () => boolean, ms: number) => {
    const deadline = Date.now() + ms
    while (!ready()) {
      const left = deadline - Date.now()
      if (left <= 0) throw new Error('timed out')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left)
        wake = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    }
  }

  return {
    async next(ms = 1000): Promise<string> {
      await until(() => waiting.length > 0, ms)
      return waiting.shift() as string
    },
    /** Resolves once the relay has reported `peers` in the room. */
    async peers(peers: number, ms = 1000): Promise<void> {
      await until(() => presence.at(-1) === peers, ms)
    },
    /** Resolves once the peer counts the relay has reported are exactly `counts`, in order. */
    async presence(counts: number[], ms = 1000): Promise<void> {
      await until(() => presence.length >= counts.length, ms).catch(() => {})
      expect(presence).toEqual(counts)
    },
  }
}

/** Resolves with the close code. */
function closed(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)))
}

test('forwards frames between the host and the device in a room', async () => {
  const a = host('r1')
  const fromDevice = inbox(a)
  await opened(a)
  const b = device('r1')
  const fromHost = inbox(b)
  await opened(b)

  a.send('hello from the host')
  expect(await fromHost.next()).toBe('hello from the host')

  b.send('hello from the device')
  expect(await fromDevice.next()).toBe('hello from the device')

  a.close()
  b.close()
})

test('does not leak frames across rooms', async () => {
  const a = host('room-a')
  const other = host('room-b')
  const elsewhere = inbox(other)
  await Promise.all([opened(a), opened(other)])

  a.send('secret')
  await expect(elsewhere.next(300)).rejects.toThrow('timed out')

  a.close()
  other.close()
})

test('a device that reconnects takes the place of its stale socket', async () => {
  const daemon = host('swap')
  const fromDevice = inbox(daemon)
  await opened(daemon)
  const stale = device('swap')
  await opened(stale)
  const staleClosed = closed(stale)

  const fresh = device('swap')
  const fromHost = inbox(fresh)
  await opened(fresh)

  // The old socket is told why it was dropped, the host is told its peer left and another came
  // (so it greets the new socket as a new connection), and the room is the host and the new socket.
  expect(await staleClosed).toBe(closeCode.replaced)
  await fromDevice.presence([1, 2, 1, 2])
  await fromHost.peers(2)
  daemon.send('for the new socket')
  expect(await fromHost.next()).toBe('for the new socket')
  fresh.send('from the new socket')
  expect(await fromDevice.next()).toBe('from the new socket')

  daemon.close()
  fresh.close()
})

test('a host that reconnects takes the place of its stale socket', async () => {
  const stale = host('rehost')
  await opened(stale)
  const phone = device('rehost')
  const fromHost = inbox(phone)
  await opened(phone)
  await fromHost.peers(2)
  const staleClosed = closed(stale)

  const fresh = host('rehost')
  await opened(fresh)

  // The device sees its host go and come back, so it starts over with the new one.
  expect(await staleClosed).toBe(closeCode.replaced)
  await fromHost.presence([2, 1, 2])
  fresh.send('still here')
  expect(await fromHost.next()).toBe('still here')

  fresh.close()
  phone.close()
})

test('tells each peer when the other arrives and leaves', async () => {
  const daemon = host('presence')
  const seen = inbox(daemon)
  await opened(daemon)
  await seen.peers(1)

  const phone = device('presence')
  await opened(phone)
  await seen.peers(2)

  phone.close()
  await seen.peers(1)

  daemon.close()
})

test('refuses a connection with no room', async () => {
  const c = new WebSocket(`ws://127.0.0.1:${relay.port}/`)
  expect(await closed(c)).toBe(closeCode.missingRoom)
})

test('refuses a host without the access key', async () => {
  const none = new WebSocket(url('gated', 'host'))
  expect(await closed(none)).toBe(closeCode.unauthorized)

  const wrong = new WebSocket(url('gated', 'host'), {
    headers: { [config.accessHeader]: 'not-the-key' },
  })
  expect(await closed(wrong)).toBe(closeCode.unauthorized)
})

test('refuses a device when the room has no host', async () => {
  expect(await closed(device('empty'))).toBe(closeCode.noHost)
})

test('lets a device join a room its host opened, without the access key', async () => {
  const daemon = host('shared')
  await opened(daemon)

  const phone = device('shared')
  const fromHost = inbox(phone)
  await opened(phone)

  daemon.send('for the phone')
  expect(await fromHost.next()).toBe('for the phone')

  daemon.close()
  phone.close()
})

test('a peer that names no role is placed by whether it holds the access key', async () => {
  // Builds from before roles: the daemon presents the key, the phone does not.
  const daemon = new WebSocket(url('old'), { headers: { [config.accessHeader]: ACCESS_KEY } })
  await opened(daemon)
  const phone = new WebSocket(url('old'))
  const fromHost = inbox(phone)
  await opened(phone)

  daemon.send('hello')
  expect(await fromHost.next()).toBe('hello')

  daemon.close()
  phone.close()
})

test('an empty access key leaves the relay open', async () => {
  const open = await createRelay({ port: 0, host: '127.0.0.1', accessKey: '' })
  const socket = new WebSocket(`ws://127.0.0.1:${open.port}/?room=any&role=host`)
  await opened(socket)

  socket.close()
  await open.close()
})
