import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RoutedTransport } from './routed-transport'

//Types
import type { ClientMessage, ServerMessage } from '@soromi/protocol'
import type { LinkFactory } from './routed-transport'
import type { Transport } from './transport'

const WELCOME: ServerMessage = { type: 'welcome', protocol: 3, version: '1.0.0' }
const HOME = 'ws://192.168.1.20:8318'
const VPN = 'ws://100.64.0.5:8318'

/** A link whose far end the test plays: it answers, drops, or stays silent on cue. */
class FakeLink implements Transport {
  sent: ClientMessage[] = []
  dials = 0
  closed = false
  private message = new Set<(message: ServerMessage) => void>()
  private dropped = new Set<(code: number) => void>()
  private presence = new Set<(present: boolean) => void>()

  constructor(readonly name: string) {}

  connect(): void {
    this.dials += 1
  }

  send(message: ClientMessage): void {
    this.sent.push(message)
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.message.add(listener)
    return () => this.message.delete(listener)
  }

  onOutput(): () => void {
    return () => {}
  }

  onOpen(): () => void {
    return () => {}
  }

  onClose(listener: (code: number) => void): () => void {
    this.dropped.add(listener)
    return () => this.dropped.delete(listener)
  }

  onPresence(listener: (present: boolean) => void): () => void {
    this.presence.add(listener)
    return () => this.presence.delete(listener)
  }

  isOpen(): boolean {
    return !this.closed
  }

  close(): void {
    this.closed = true
    this.message.clear()
    this.dropped.clear()
    this.presence.clear()
  }

  /** The daemon says something on this link. */
  hear(message: ServerMessage): void {
    for (const listener of [...this.message]) listener(message)
  }

  /** The socket drops. */
  drop(code = 1006): void {
    for (const listener of [...this.dropped]) listener(code)
  }

  /** The relay says whether the daemon is in the room. */
  present(present: boolean): void {
    for (const listener of [...this.presence]) listener(present)
  }

  /** The last ping sent on this link, answered. */
  answerPing(): void {
    const ping = this.sent.filter((message) => message.type === 'ping').at(-1)
    if (ping?.type === 'ping') this.hear({ type: 'pong', nonce: ping.nonce })
  }
}

/** A routed transport over fake links, with a record of what the app above it was told. */
const setup = (routes: string[] = []) => {
  const made: FakeLink[] = []
  const links: LinkFactory = {
    relay: () => {
      const link = new FakeLink('relay')
      made.push(link)
      return link
    },
    direct: (route) => {
      const link = new FakeLink(route)
      made.push(link)
      return link
    },
  }
  const transport = new RoutedTransport(
    { relay: { relayUrl: 'wss://relay.test', room: 'r', key: 'k' }, device: 'd1', routes },
    { clientId: 'phone' },
    links,
  )
  const seen = {
    opens: 0,
    closes: [] as number[],
    routes: [] as Array<string | null>,
    learned: [] as string[][],
    messages: [] as string[],
  }
  transport.onOpen(() => {
    seen.opens += 1
  })
  transport.onClose((code) => seen.closes.push(code))
  transport.onRoute((route) => seen.routes.push(route))
  transport.onRoutes((learned) => seen.learned.push(learned))
  transport.onMessage((message) => seen.messages.push(message.type))

  /** The newest link made for `name` that is still open. */
  const link = (name: string): FakeLink | undefined =>
    made.filter((one) => one.name === name && !one.closed).at(-1)

  return { transport, seen, made, link }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('choosing a route', () => {
  it('uses the relay at once when it knows no direct route', () => {
    const { transport, seen, link } = setup()
    transport.connect()

    expect(link('relay')?.dials).toBe(1)
    expect(transport.isOpen()).toBe(false)

    link('relay')?.hear(WELCOME)
    expect(transport.isOpen()).toBe(true)
    expect(seen.routes).toEqual(['relay'])
    expect(seen.opens).toBe(1)
  })

  it('tries the direct routes first and never dials the relay when one answers', () => {
    const { transport, seen, link, made } = setup([HOME, VPN])
    transport.connect()

    expect(link(HOME)?.dials).toBe(1)
    expect(link(VPN)?.dials).toBe(1)
    expect(link('relay')).toBeUndefined()

    link(HOME)?.hear(WELCOME)
    expect(seen.routes).toEqual(['direct'])
    expect(seen.opens).toBe(1)
    // The other attempt is dropped, and the relay is left alone even after its head start.
    expect(made.find((one) => one.name === VPN)?.closed).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(link('relay')).toBeUndefined()
  })

  it('brings the relay in after a head start, and at once when every direct route fails', () => {
    const slow = setup([HOME])
    slow.transport.connect()
    vi.advanceTimersByTime(299)
    expect(slow.link('relay')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(slow.link('relay')?.dials).toBe(1)

    const refused = setup([HOME])
    refused.transport.connect()
    refused.link(HOME)?.drop()
    expect(refused.link('relay')?.dials).toBe(1)
  })

  it('counts a route as good only once the daemon has answered on it', () => {
    const { transport, seen, link } = setup([HOME])
    transport.connect()

    // Something at that address talks, but not as the daemon would.
    link(HOME)?.hear({ type: 'error', message: 'who are you' })
    expect(transport.isOpen()).toBe(false)

    // The attempt is given up after a while, and the relay carries on.
    vi.advanceTimersByTime(3000)
    link('relay')?.hear(WELCOME)
    expect(seen.routes).toEqual(['relay'])
  })
})

describe('moving between routes', () => {
  it('moves from the relay to a direct route that answers, without reporting a drop', () => {
    const { transport, seen, link, made } = setup()
    transport.connect()
    const relay = link('relay')
    relay?.hear(WELCOME)

    // The daemon says where it can be reached directly; the route is tried right away.
    relay?.hear({ type: 'routes', routes: [HOME] })
    expect(seen.learned).toEqual([[HOME]])
    link(HOME)?.hear(WELCOME)

    expect(seen.routes).toEqual(['relay', 'direct'])
    expect(seen.closes).toEqual([])
    // The app sees it open again, and asks afresh for what it shows.
    expect(seen.opens).toBe(2)
    expect(made[0].closed).toBe(true)

    transport.send({ type: 'list-workspaces' })
    expect(link(HOME)?.sent.at(-1)).toEqual({ type: 'list-workspaces' })
  })

  it('falls back to the relay when the direct link drops, and tries direct again', () => {
    const { transport, seen, link } = setup([HOME])
    transport.connect()
    const first = link(HOME)
    first?.hear(WELCOME)

    first?.drop()
    expect(seen.closes).toEqual([1006])
    expect(seen.routes).toEqual(['direct', null])
    expect(transport.isOpen()).toBe(false)
    // A new attempt at the direct route, and the relay after its head start.
    expect(link(HOME)).not.toBe(first)
    vi.advanceTimersByTime(300)
    link('relay')?.hear(WELCOME)

    expect(seen.routes).toEqual(['direct', null, 'relay'])
    expect(seen.opens).toBe(2)
  })

  it('starts its direct attempts over when the daemon reports its routes again', () => {
    const { transport, seen, link } = setup([HOME])
    transport.connect()
    vi.advanceTimersByTime(300)
    const stuck = link(HOME)
    link('relay')?.hear(WELCOME)

    // The first attempt hangs on a socket that will never answer. The daemon then says where it
    // is, over the relay: a new attempt starts now instead of waiting for the old one to give up.
    link('relay')?.hear({ type: 'routes', routes: [HOME, VPN] })
    expect(stuck?.closed).toBe(true)
    expect(link(HOME)).not.toBe(stuck)
    link(HOME)?.hear(WELCOME)
    expect(seen.routes).toEqual(['relay', 'direct'])
  })

  it('keeps trying the direct routes while on the relay', () => {
    const { transport, seen, link } = setup([HOME])
    transport.connect()
    vi.advanceTimersByTime(300)
    link('relay')?.hear(WELCOME)
    // The first attempt runs out of time: the phone is not on that network.
    vi.advanceTimersByTime(3000)
    expect(link(HOME)).toBeUndefined()

    // Later it is: the next try comes half a minute after the transport started. Answer the
    // checks on the relay meanwhile, so it stays the link in use.
    for (let passed = 0; passed < 27_000; passed += 1000) {
      vi.advanceTimersByTime(1000)
      link('relay')?.answerPing()
    }
    link(HOME)?.hear(WELCOME)
    expect(seen.routes).toEqual(['relay', 'direct'])
  })

  it('holds what is sent while there is no route, and sends it on the next one', () => {
    const { transport, link } = setup()
    transport.connect()
    transport.send({ type: 'list-workspaces' })
    expect(link('relay')?.sent).toEqual([])

    link('relay')?.hear(WELCOME)
    expect(link('relay')?.sent).toEqual([{ type: 'list-workspaces' }])
  })
})

describe('liveness', () => {
  it('drops a direct link that stops answering, before its socket notices', () => {
    const { transport, seen, link } = setup([HOME])
    transport.connect()
    const direct = link(HOME)
    direct?.hear(WELCOME)

    // The phone left the network: asked to check, the link does not answer.
    transport.recheck()
    expect(direct?.sent.at(-1)?.type).toBe('ping')
    vi.advanceTimersByTime(3000)

    expect(seen.closes).toEqual([0])
    expect(direct?.closed).toBe(true)
    expect(transport.isOpen()).toBe(false)
  })

  it('leaves a link that answers alone, and keeps the answer to itself', () => {
    const { transport, seen, link } = setup([HOME])
    transport.connect()
    const direct = link(HOME)
    direct?.hear(WELCOME)

    transport.recheck()
    direct?.answerPing()
    vi.advanceTimersByTime(3000)

    expect(transport.isOpen()).toBe(true)
    expect(seen.closes).toEqual([])
    expect(seen.messages).toEqual(['welcome'])
  })

  it('dials the relay again when it stops answering', () => {
    const { transport, seen, link } = setup()
    transport.connect()
    const relay = link('relay')
    relay?.hear(WELCOME)

    transport.recheck()
    vi.advanceTimersByTime(3000)

    expect(seen.closes).toEqual([0])
    expect(relay?.dials).toBe(2)
    relay?.hear(WELCOME)
    expect(seen.opens).toBe(2)
  })

  it('asks a link that has gone quiet to answer, and drops it when it does not', () => {
    const { transport, seen, link } = setup()
    transport.connect()
    const relay = link('relay')
    relay?.hear(WELCOME)

    // Nothing is asked while the link is talking.
    vi.advanceTimersByTime(7000)
    relay?.hear({ type: 'keep-awake', active: false, mode: 'off' })
    vi.advanceTimersByTime(7000)
    expect(relay?.sent.filter((message) => message.type === 'ping')).toEqual([])

    // Then it goes quiet: the computer fell asleep, and no socket says so.
    vi.advanceTimersByTime(1000)
    expect(relay?.sent.at(-1)?.type).toBe('ping')
    expect(transport.isOpen()).toBe(true)
    vi.advanceTimersByTime(3000)
    expect(transport.isOpen()).toBe(false)
    expect(seen.closes).toEqual([0])
  })

  it('takes anything the daemon says as an answer', () => {
    const { transport, seen, link } = setup()
    transport.connect()
    const relay = link('relay')
    relay?.hear(WELCOME)
    vi.advanceTimersByTime(7500)
    expect(relay?.sent.at(-1)?.type).toBe('ping')

    // Not the pong, but proof all the same that the daemon is there.
    relay?.hear({ type: 'keep-awake', active: true, mode: 'off' })
    vi.advanceTimersByTime(3000)
    expect(transport.isOpen()).toBe(true)
    expect(seen.closes).toEqual([])
  })

  it('checks a quiet link before sending into it', () => {
    const { transport, link } = setup()
    transport.connect()
    const relay = link('relay')
    relay?.hear(WELCOME)

    // Sent straight after hearing from the daemon: no need to ask.
    transport.send({ type: 'list-workspaces' })
    expect(relay?.sent.map((message) => message.type)).toEqual(['list-workspaces'])

    // A few quiet seconds later, the message goes with a check ahead of it.
    vi.advanceTimersByTime(4000)
    transport.send({ type: 'list-workspaces' })
    expect(relay?.sent.map((message) => message.type)).toEqual([
      'list-workspaces',
      'ping',
      'list-workspaces',
    ])
    vi.advanceTimersByTime(3000)
    expect(transport.isOpen()).toBe(false)
  })

  it('has little patience when the app says to check now', () => {
    const { transport, link } = setup([HOME])
    transport.connect()
    link(HOME)?.hear(WELCOME)

    // A direct link answers in milliseconds, or not at all.
    transport.recheck()
    vi.advanceTimersByTime(799)
    expect(transport.isOpen()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(transport.isOpen()).toBe(false)
  })

  it('on a recheck with no link, dials the relay now and tries direct', () => {
    const { transport, link } = setup([HOME])
    transport.connect()
    vi.advanceTimersByTime(3300)
    expect(link(HOME)).toBeUndefined()
    const dials = link('relay')?.dials ?? 0

    transport.recheck()
    expect(link('relay')?.dials).toBe(dials + 1)
    expect(link(HOME)?.dials).toBe(1)
  })
})

describe('how good the link is', () => {
  it('times each round trip on the link in use, by the route it went', () => {
    const { transport, link } = setup()
    const timed: Array<[number, string]> = []
    transport.onLatency((ms, route) => timed.push([ms, route]))
    transport.connect()
    link('relay')?.hear(WELCOME)

    transport.measure()
    vi.advanceTimersByTime(120)
    link('relay')?.answerPing()

    expect(timed).toEqual([[120, 'relay']])
  })

  it('times the checks it makes on its own too, and nothing without a link', () => {
    const { transport, link } = setup()
    const timed: number[] = []
    transport.onLatency((ms) => timed.push(ms))
    transport.measure()
    transport.connect()
    link('relay')?.hear(WELCOME)

    // Quiet long enough to be checked.
    vi.advanceTimersByTime(7500)
    vi.advanceTimersByTime(40)
    link('relay')?.answerPing()

    expect(timed).toHaveLength(1)
  })

  it('does not time an answer twice, or one it did not ask for', () => {
    const { transport, link } = setup()
    const timed: number[] = []
    transport.onLatency((ms) => timed.push(ms))
    transport.connect()
    link('relay')?.hear(WELCOME)

    transport.measure()
    link('relay')?.answerPing()
    link('relay')?.answerPing()
    link('relay')?.hear({ type: 'pong', nonce: 999 })

    expect(timed).toEqual([0])
  })
})

describe('what the app is told', () => {
  it('learns why the computer cannot be reached from the relay, while no route is up', () => {
    const { transport, seen, link } = setup()
    transport.connect()
    link('relay')?.drop(4004)
    expect(seen.closes).toEqual([4004])
  })

  it('is not told of the relay’s troubles while a direct link is up', () => {
    const { transport, seen, link, made } = setup([HOME])
    transport.connect()
    vi.advanceTimersByTime(300)
    const relay = link('relay')
    link(HOME)?.hear(WELCOME)

    // The relay link was dropped when the direct one took over; whatever it does now is nothing.
    expect(made.find((one) => one.name === 'relay')?.closed).toBe(true)
    relay?.drop(4004)
    expect(seen.closes).toEqual([])
  })

  it('is told the computer cannot be reached once no route has answered for a while', () => {
    const { transport, link } = setup([HOME])
    const presence: boolean[] = []
    transport.onPresence((present) => presence.push(present))
    transport.connect()

    // The relay is up and says the daemon is in the room, but the daemon never answers: the
    // computer is asleep. Every attempt goes on, and the app is told once.
    vi.advanceTimersByTime(7999)
    expect(presence).toEqual([])
    vi.advanceTimersByTime(1)
    expect(presence).toEqual([false])
    vi.advanceTimersByTime(60_000)
    expect(presence).toEqual([false])

    // It wakes and answers. If it goes away again, that is a new outage, and is said again.
    link('relay')?.hear(WELCOME)
    link('relay')?.drop()
    vi.advanceTimersByTime(8000)
    expect(presence).toEqual([false, false])
  })

  it('hears that the daemon left the relay room, and is back when it returns', () => {
    const { transport, seen, link } = setup()
    const presence: boolean[] = []
    transport.onPresence((present) => presence.push(present))
    transport.connect()
    link('relay')?.hear(WELCOME)

    link('relay')?.present(false)
    expect(presence).toEqual([false])
    expect(transport.isOpen()).toBe(false)

    link('relay')?.hear(WELCOME)
    expect(seen.routes).toEqual(['relay', null, 'relay'])
    expect(seen.opens).toBe(2)
  })

  it('passes on that the app or the desktop must update, whichever link says so', () => {
    const { transport, seen, link } = setup()
    transport.connect()
    link('relay')?.hear({ type: 'incompatible', protocol: 9, action: 'update-client' })

    expect(seen.messages).toEqual(['incompatible'])
    expect(transport.isOpen()).toBe(false)
  })

  it('stops everything when closed', () => {
    const { transport, made } = setup([HOME])
    transport.connect()
    vi.advanceTimersByTime(300)
    transport.close()

    expect(made.every((one) => one.closed)).toBe(true)
    vi.advanceTimersByTime(120_000)
    expect(made).toHaveLength(2)
  })
})
