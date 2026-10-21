import { DirectTransport } from './direct-transport'
import { RelayTransport } from './relay-transport'

//Types
import type { ClientMessage, DeviceRoute, ServerMessage } from '@soromi/protocol'
import type { RelayConfig } from './relay-transport'
import type { Transport } from './transport'
import type { TransportOptions } from './web-socket-transport'

/** How long the direct routes are tried before the relay is dialed alongside them. */
const HEAD_START_MS = 300
/** How long one attempt at a direct route may take before it is given up. */
const PROBE_TIMEOUT_MS = 3000
/** How often the direct routes are tried again while the relay is in use. */
const REPROBE_MS = 30_000
/** How often the link in use is looked at. */
const CHECK_EVERY_MS = 2500
/** How long the link in use may say nothing before the daemon is asked to answer. */
const QUIET_MS = 7500
/** The same, when something is about to be sent: a message into a dead link is simply lost. */
const QUIET_BEFORE_SEND_MS = 4000
/** How long the daemon has to answer before the link is taken for dead. */
const VERIFY_TIMEOUT_MS = 3000
/**
 * The same, when the app says to check now (it came back to the foreground, or the network
 * changed): that is when a link is most likely dead and someone is waiting on it. A direct link
 * answers in milliseconds; the relay's round trip crosses the internet twice.
 */
const RECHECK_TIMEOUT_MS: Record<DeviceRoute, number> = { direct: 800, relay: 1500 }
/** How long no route may answer before the app is told the computer cannot be reached. */
const STALL_MS = 8000

export interface RoutedConfig {
  /** The way through the relay, which works from anywhere. */
  relay: RelayConfig & { key: string }
  /** The id the desktop gave this device. */
  device: string
  /** The direct routes the daemon reported the last time it was reached; none on a first run. */
  routes?: string[]
}

/** Makes the links a routed transport chooses between. Replaced in tests. */
export interface LinkFactory {
  relay(): Transport
  direct(route: string): Transport
}

/** The link in use, and which way it goes. */
interface Active {
  link: Transport
  route: DeviceRoute
}

/**
 * Transport to the daemon by whichever route answers: straight to the computer when the phone
 * shares a network with it, through the relay otherwise. Nothing above it knows which is in use.
 *
 * - **Choosing.** The direct routes are tried first and the relay shortly after, so being away
 *   from the computer's network costs a fraction of a second. A route is proven by the daemon's
 *   answer to `hello`, which only the holder of the pairing key can produce; the first direct
 *   route to prove itself is used, and the relay otherwise.
 * - **Moving up.** While on the relay the direct routes are tried again, on a timer and whenever
 *   the daemon reports new ones or the app says the network changed. When one answers, the
 *   transport moves to it without reporting a drop: listeners just see it open again, and ask for
 *   what they need as after any reconnect.
 * - **Falling back.** A direct link that drops is not retried on its own; the relay is dialed at
 *   once, next to another try at the direct routes.
 * - **Liveness.** A link that has gone quiet is asked to answer: after a few seconds of silence,
 *   sooner when something is about to be sent, and at once on `recheck`. One that does not answer
 *   is dropped before the socket notices, which it often never does: a computer that fell asleep
 *   leaves every socket to it looking open. The phone drives this, since it is the one that knows
 *   it changed network or was just picked up again.
 * - **Saying so.** While no route has answered for some seconds the app is told the computer is
 *   not reachable, instead of being left to say "connecting" for as long as it takes.
 */
export class RoutedTransport implements Transport {
  private readonly messageListeners = new Set<(message: ServerMessage) => void>()
  private readonly outputListeners = new Set<(session: string, data: string) => void>()
  private readonly openListeners = new Set<() => void>()
  private readonly closeListeners = new Set<(code: number) => void>()
  private readonly presenceListeners = new Set<(present: boolean) => void>()
  private readonly routeListeners = new Set<(route: DeviceRoute | null) => void>()
  private readonly routesListeners = new Set<(routes: string[]) => void>()
  private readonly links: LinkFactory
  private routes: string[]
  private active: Active | null = null
  /** The relay link, while it is dialing, waiting for the daemon, or in use. */
  private relay: Transport | null = null
  /** Attempts at direct routes under way, by route, each with the timer that gives up on it. */
  private readonly probes = new Map<
    string,
    { link: Transport; timeout: ReturnType<typeof setTimeout> }
  >()
  private queued: ClientMessage[] = []
  private closed = true
  private headStart: ReturnType<typeof setTimeout> | null = null
  private reprobe: ReturnType<typeof setInterval> | null = null
  private checkEvery: ReturnType<typeof setInterval> | null = null
  /** The check waiting for an answer: when it gives up, and the timer that does. */
  private verifying: { deadline: number; timeout: ReturnType<typeof setTimeout> } | null = null
  /** Fires when no route has answered for a while, to say so. */
  private stall: ReturnType<typeof setTimeout> | null = null
  /** When the link in use last said anything at all. */
  private lastHeard = 0
  private nonce = 0

  constructor(config: RoutedConfig, options: TransportOptions, links?: LinkFactory) {
    this.routes = config.routes ?? []
    this.links = links ?? {
      relay: () => new RelayTransport(config.relay, options),
      direct: (route) =>
        new DirectTransport({ route, device: config.device, key: config.relay.key }, options),
    }
  }

  connect(): void {
    this.teardown()
    this.closed = false
    this.reprobe = setInterval(() => {
      if (this.active?.route !== 'direct') this.probeDirect()
    }, REPROBE_MS)
    this.checkEvery = setInterval(() => {
      if (this.quietFor(QUIET_MS)) this.verify()
    }, CHECK_EVERY_MS)

    this.race()
    this.armStall()
  }

  send(message: ClientMessage): void {
    if (!this.active) {
      this.queued.push(message)
      return
    }
    // Nothing says whether this arrives. If the link has been quiet, find out now.
    if (this.quietFor(QUIET_BEFORE_SEND_MS)) this.verify()
    this.active.link.send(message)
  }

  /**
   * The app came back to the foreground, the phone's network changed, or the user asked to try
   * again. Checks at once, and with little patience, that the link in use still answers; tries the
   * direct routes if it is not on one; and dials the relay now rather than waiting out a retry
   * delay.
   */
  recheck(): void {
    if (this.closed) return
    if (this.active) {
      this.verify(RECHECK_TIMEOUT_MS[this.active.route])
    } else {
      this.relay?.connect()
      if (!this.relay) this.dialRelay()
      this.armStall()
    }
    if (this.active?.route !== 'direct') this.probeDirect(true)
  }

  /** Fires with the route in use each time it changes; `null` while there is none. */
  onRoute(listener: (route: DeviceRoute | null) => void): () => void {
    this.routeListeners.add(listener)
    return () => {
      this.routeListeners.delete(listener)
    }
  }

  /** Fires when the daemon reports its direct routes and they differ from the ones held. */
  onRoutes(listener: (routes: string[]) => void): () => void {
    this.routesListeners.add(listener)
    return () => {
      this.routesListeners.delete(listener)
    }
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener)
    return () => {
      this.messageListeners.delete(listener)
    }
  }

  onOutput(listener: (session: string, data: string) => void): () => void {
    this.outputListeners.add(listener)
    return () => {
      this.outputListeners.delete(listener)
    }
  }

  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener)
    return () => {
      this.openListeners.delete(listener)
    }
  }

  onClose(listener: (code: number) => void): () => void {
    this.closeListeners.add(listener)
    return () => {
      this.closeListeners.delete(listener)
    }
  }

  onPresence(listener: (present: boolean) => void): () => void {
    this.presenceListeners.add(listener)
    return () => {
      this.presenceListeners.delete(listener)
    }
  }

  isOpen(): boolean {
    return this.active !== null
  }

  close(): void {
    this.teardown()
    this.closed = true
    this.messageListeners.clear()
    this.outputListeners.clear()
    this.openListeners.clear()
    this.closeListeners.clear()
    this.presenceListeners.clear()
    this.routeListeners.clear()
    this.routesListeners.clear()
    this.queued = []
  }

  /** Drops every link and timer. Listeners are kept. */
  private teardown(): void {
    for (const timer of [this.headStart, this.verifying?.timeout, this.stall]) {
      if (timer) clearTimeout(timer)
    }
    for (const timer of [this.reprobe, this.checkEvery]) {
      if (timer) clearInterval(timer)
    }
    this.headStart = null
    this.reprobe = null
    this.checkEvery = null
    this.verifying = null
    this.stall = null
    for (const probe of this.probes.values()) {
      clearTimeout(probe.timeout)
      probe.link.close()
    }
    this.probes.clear()
    // The link in use may be the relay link: close each once.
    const direct = this.active?.route === 'direct' ? this.active.link : null
    this.active = null
    direct?.close()
    this.relay?.close()
    this.relay = null
  }

  /**
   * Gets a link up from nothing: the direct routes first, and the relay shortly after, or at once
   * if there is no direct route to try or every attempt at one has already failed.
   */
  private race(): void {
    if (this.routes.length === 0) {
      this.dialRelay()
      return
    }
    this.probeDirect()
    if (this.headStart || this.relay) return
    this.headStart = setTimeout(() => {
      this.headStart = null
      this.dialRelay()
    }, HEAD_START_MS)
  }

  /** Starts the relay link, unless it is already there. It retries on its own from then on. */
  private dialRelay(): void {
    if (this.relay || this.closed) return
    const link = this.links.relay()
    this.relay = link
    link.onMessage((message) => this.heard(link, message))
    link.onOutput((session, data) => this.output(link, session, data))
    link.onClose((code) => {
      if (this.relay !== link) return
      // In use: the app must know. Not in use: only when nothing else is, since the code says
      // why the computer cannot be reached (it is off, or this pairing is open elsewhere).
      if (this.active?.link === link) this.lost(code)
      else if (!this.active) this.emitClose(code)
    })
    link.onPresence((present) => {
      if (this.relay !== link) return
      if (this.active && this.active.link !== link) return
      // The daemon left the relay room: the socket to the relay is up, with nobody behind it.
      if (!present && this.active?.link === link) this.unseat()
      for (const listener of this.presenceListeners) listener(present)
      if (!present) this.probeDirect()
    })
    link.connect()
  }

  /**
   * Tries every direct route that is not already being tried. With `afresh`, attempts under way
   * are dropped and started over: something changed (the network, or what the daemon says its
   * addresses are), and an attempt begun before that may be waiting on a socket that will never
   * answer.
   */
  private probeDirect(afresh = false): void {
    if (this.closed) return
    if (afresh) {
      for (const probe of this.probes.values()) {
        clearTimeout(probe.timeout)
        probe.link.close()
      }
      this.probes.clear()
    }
    for (const route of this.routes) {
      if (this.probes.has(route)) continue
      const link = this.links.direct(route)
      const timeout = setTimeout(() => this.failed(route, link), PROBE_TIMEOUT_MS)
      this.probes.set(route, { link, timeout })
      link.onMessage((message) => this.heard(link, message))
      link.onOutput((session, data) => this.output(link, session, data))
      link.onClose((code) => {
        if (this.active?.link === link) this.lost(code)
        else this.failed(route, link)
      })
      link.connect()
    }
  }

  /** An attempt at a direct route came to nothing. */
  private failed(route: string, link: Transport): void {
    const probe = this.probes.get(route)
    if (probe?.link !== link) return
    clearTimeout(probe.timeout)
    this.probes.delete(route)
    link.close()
    // Every direct route has failed: no reason to keep the relay waiting.
    if (this.probes.size === 0 && this.headStart) {
      clearTimeout(this.headStart)
      this.headStart = null
      this.dialRelay()
    }
  }

  /** A message arrived on one of the links. */
  private heard(link: Transport, message: ServerMessage): void {
    if (this.active?.link !== link) {
      // The daemon answered this link's hello: only the holder of the key could have.
      if (message.type === 'welcome') this.proven(link)
      // It cannot be served on any route; the app has to say so.
      else if (message.type === 'incompatible') this.emitMessage(message)
      if (this.active?.link !== link) return
    }
    this.alive()
    // The answer to a check is for this transport alone.
    if (message.type === 'pong') return
    if (message.type === 'routes') this.learn(message.routes)
    this.emitMessage(message)
  }

  private output(link: Transport, session: string, data: string): void {
    if (this.active?.link !== link) return
    this.alive()
    for (const listener of this.outputListeners) listener(session, data)
  }

  /** The link in use said something: whatever it was, the daemon is there. */
  private alive(): void {
    this.lastHeard = Date.now()
    this.cancelVerify()
  }

  /** Whether the link in use has said nothing for `ms`. */
  private quietFor(ms: number): boolean {
    return this.active !== null && Date.now() - this.lastHeard >= ms
  }

  /** A link that is not in use has shown the daemon is on its other end. */
  private proven(link: Transport): void {
    if (link === this.relay) {
      // A direct link in use is better; the relay only steps in when there is none.
      if (!this.active) this.seat(link, 'relay')
      return
    }
    const route = [...this.probes].find(([, probe]) => probe.link === link)?.[0]
    if (route === undefined) return
    const probe = this.probes.get(route)
    if (probe) clearTimeout(probe.timeout)
    this.probes.delete(route)
    if (this.active?.route === 'direct') {
      // Another direct route got there first.
      link.close()
      return
    }
    // The other attempts and the relay are not needed while this holds.
    for (const other of this.probes.values()) {
      clearTimeout(other.timeout)
      other.link.close()
    }
    this.probes.clear()
    if (this.headStart) clearTimeout(this.headStart)
    this.headStart = null
    const relay = this.relay
    this.relay = null
    this.seat(link, 'direct')
    relay?.close()
  }

  /** Makes a proven link the one in use, and tells the app the transport is open (again). */
  private seat(link: Transport, route: DeviceRoute): void {
    this.cancelVerify()
    if (this.stall) clearTimeout(this.stall)
    this.stall = null
    this.active = { link, route }
    this.lastHeard = Date.now()
    for (const listener of this.routeListeners) listener(route)
    const queued = this.queued
    this.queued = []
    for (const message of queued) link.send(message)
    for (const listener of this.openListeners) listener()
  }

  /** The link in use is no longer one: forget it, and say there is no route for now. */
  private unseat(): void {
    this.cancelVerify()
    this.active = null
    for (const listener of this.routeListeners) listener(null)
    this.armStall()
  }

  /**
   * Starts the wait after which, with still no route answering, the app is told the computer
   * cannot be reached. It is told once per outage: the routes go on being tried all the while,
   * and each failed attempt would otherwise be news.
   */
  private armStall(): void {
    if (this.stall || this.active || this.closed) return
    this.stall = setTimeout(() => {
      this.stall = null
      if (this.active || this.closed) return
      for (const listener of this.presenceListeners) listener(false)
    }, STALL_MS)
  }

  /** The link in use dropped. Tell the app, and get another one up. */
  private lost(code: number): void {
    const was = this.active
    if (!was) return
    this.unseat()
    this.emitClose(code)
    if (this.closed) return
    if (was.route === 'direct') {
      // A direct link is one attempt; start over, the same way as at first.
      was.link.close()
      this.race()
      return
    }
    // A relay link dials again on its own. The direct routes get a try meanwhile.
    this.probeDirect()
  }

  /**
   * Asks the daemon to answer on the link in use, and drops the link if nothing at all is heard
   * on it within `within`. A check already waiting stands, unless this one is less patient.
   */
  private verify(within = VERIFY_TIMEOUT_MS): void {
    const active = this.active
    if (!active) return
    const deadline = Date.now() + within
    if (this.verifying) {
      if (this.verifying.deadline <= deadline) return
      clearTimeout(this.verifying.timeout)
    }
    const timeout = setTimeout(() => {
      this.verifying = null
      if (this.active !== active) return
      // The socket has not noticed, so it is not going to say: act as if it had.
      if (active.route === 'relay') {
        this.unseat()
        this.emitClose(0)
        // Dialing again replaces the dead socket with a new one.
        active.link.connect()
        this.probeDirect()
      } else {
        this.lost(0)
      }
    }, within)
    this.verifying = { deadline, timeout }
    this.nonce += 1
    active.link.send({ type: 'ping', nonce: this.nonce })
  }

  private cancelVerify(): void {
    if (this.verifying) clearTimeout(this.verifying.timeout)
    this.verifying = null
  }

  /** The daemon said where it can be reached directly. */
  private learn(routes: string[]): void {
    if (
      routes.length === this.routes.length &&
      routes.every((route, i) => route === this.routes[i])
    ) {
      return
    }
    this.routes = routes
    for (const listener of this.routesListeners) listener(routes)
    if (this.active?.route !== 'direct') this.probeDirect(true)
  }

  private emitMessage(message: ServerMessage): void {
    for (const listener of this.messageListeners) listener(message)
  }

  private emitClose(code: number): void {
    for (const listener of this.closeListeners) listener(code)
  }
}
