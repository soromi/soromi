import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { WebSocket } from 'ws'

//Config
import { closeCode, config } from '../config/app'

//Harness
import { ACCESS_KEY, closed, inbox, opened, peers, startRelay } from './harness'

/**
 * The relay as Cloudflare runs it (`wrangler dev`), connected to as the daemon and the phone
 * connect to it. It takes a few seconds to start, so it runs on its own:
 * `pnpm --filter @soromi/relay test`.
 */
const enabled = process.env.RELAY_WORKER_TEST === '1'

describe.skipIf(!enabled)('the relay', () => {
  let stop = () => {}
  let base = ''
  let host: (room: string) => WebSocket
  let device: (room: string) => WebSocket
  let url: (room: string, role?: string) => string

  beforeAll(async () => {
    const relay = await startRelay()
    stop = relay.stop
    base = relay.base
    ;({ host, device, url } = peers(base))
  }, 70_000)

  afterAll(() => stop())

  test('forwards frames between the host and the device, text as text and binary as binary', async () => {
    const a = host('r1')
    const fromDevice = inbox(a)
    await opened(a)
    const b = device('r1')
    const fromHost = inbox(b)
    await opened(b)

    a.send('hello from the host')
    expect((await fromHost.next()).toString()).toBe('hello from the host')
    b.send(Buffer.from([1, 2, 3]))
    expect([...(await fromDevice.next())]).toEqual([1, 2, 3])

    a.close()
    b.close()
  })

  test('carries a frame as large as a picture the computer sends a phone', async () => {
    const a = host('big')
    await opened(a)
    const b = device('big')
    const fromHost = inbox(b)
    await opened(b)

    // A 2 MB picture in base64, sealed: about 3 MB.
    const frame = Buffer.alloc(3 * 1024 * 1024, 7)
    a.send(frame)
    expect((await fromHost.next(5000)).length).toBe(frame.length)

    a.close()
    b.close()
  })

  test('does not leak frames across rooms', async () => {
    const a = host('room-a')
    const other = host('room-b')
    const elsewhere = inbox(other)
    await Promise.all([opened(a), opened(other)])

    a.send('secret')
    await expect(elsewhere.next(400)).rejects.toThrow('timed out')

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

    expect(await staleClosed).toBe(closeCode.replaced)
    await fromDevice.presence([1, 2, 1, 2])
    await fromHost.peers(2)
    daemon.send('for the new socket')
    expect((await fromHost.next()).toString()).toBe('for the new socket')
    fresh.send('from the new socket')
    expect((await fromDevice.next()).toString()).toBe('from the new socket')

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

    expect(await staleClosed).toBe(closeCode.replaced)
    await fromHost.presence([2, 1, 2])
    fresh.send('still here')
    expect((await fromHost.next()).toString()).toBe('still here')

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

  test('answers its health check, and nothing but its two paths', async () => {
    expect(await (await fetch(`http://${base}/health`)).text()).toBe('ok')
    expect((await fetch(`http://${base}/rooms`)).status).toBe(404)
    // The relay's own path is for WebSockets only.
    expect((await fetch(`http://${base}/?room=r`)).status).toBe(426)
  })

  test('refuses a connection with no room', async () => {
    expect(await closed(new WebSocket(`ws://${base}/`))).toBe(closeCode.missingRoom)
  })

  test('refuses a host without the access key', async () => {
    expect(await closed(new WebSocket(url('gated', 'host')))).toBe(closeCode.unauthorized)
    const wrong = new WebSocket(url('gated', 'host'), {
      headers: { [config.accessHeader]: 'not-the-key' },
    })
    expect(await closed(wrong)).toBe(closeCode.unauthorized)
  })

  test('refuses a device when the room has no host', async () => {
    expect(await closed(device('empty'))).toBe(closeCode.noHost)
  })

  test('a peer that names no role is placed by whether it holds the access key', async () => {
    const daemon = new WebSocket(url('old'), { headers: { [config.accessHeader]: ACCESS_KEY } })
    await opened(daemon)
    const phone = new WebSocket(url('old'))
    const fromHost = inbox(phone)
    await opened(phone)

    daemon.send('hello')
    expect((await fromHost.next()).toString()).toBe('hello')

    daemon.close()
    phone.close()
  })
})
