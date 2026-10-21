import { DurableObject } from 'cloudflare:workers'

//Config
import { closeCode, config } from '../config/app'

//Helpers
import { refuse } from '../helpers/refuse'
import { ROLES, other, presenceFrame } from './seats'

//Types
import type { Env, Role, Seat } from '../types'

const seatOf = (socket: WebSocket): Seat | null => socket.deserializeAttachment() as Seat | null

/**
 * One room: the daemon (`host`) and its paired phone (`device`), with their frames cross-forwarded
 * verbatim. Content-blind: it never looks inside a frame, which is end-to-end encrypted between the
 * two anyway, and stores nothing. Its sockets use the hibernation API, so a room whose phone is
 * away costs nothing while the daemon waits in it.
 */
export class Room extends DurableObject<Env> {
  /** A peer joins, in the role the Worker decided (`config.roleHeader`). */
  async fetch(request: Request): Promise<Response> {
    const role: Role = request.headers.get(config.roleHeader) === 'host' ? 'host' : 'device'
    // A device joins a room its host opened; there has to be one in it.
    if (role === 'device' && !this.seated('host')) return refuse(closeCode.noHost, 'no host')

    // A peer that reconnects before its old socket is noticed dead takes that socket's place,
    // instead of waiting for it to time out. The other side is told the old one left before the
    // new one arrives: it is a new connection, and has to be greeted as one.
    const stale = this.seated(role)
    if (stale) {
      this.vacate(stale)
      try {
        stale.close(closeCode.replaced, 'replaced')
      } catch {
        // Already closing.
      }
    }

    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server, [role])
    server.serializeAttachment({ role, gone: false } satisfies Seat)
    this.announce()

    return new Response(null, { status: 101, webSocket: client })
  }

  /** A frame from one peer goes to the other, as it came (text or binary). */
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const seat = seatOf(socket)
    if (!seat || seat.gone) return
    try {
      this.seated(other(seat.role))?.send(message)
    } catch {
      // The other peer went in the meantime; its close says so.
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    this.vacate(socket)
    try {
      socket.close(code, reason)
    } catch {
      // The runtime already answered the close.
    }
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    this.vacate(socket)
  }

  /** The socket holding a role, if one does. */
  private seated(role: Role): WebSocket | undefined {
    return this.ctx.getWebSockets(role).find((socket) => {
      const seat = seatOf(socket)
      return seat !== null && !seat.gone && socket.readyState === WebSocket.OPEN
    })
  }

  /** Takes a socket out of its seat; the room is told, if it still held one. */
  private vacate(socket: WebSocket): void {
    const seat = seatOf(socket)
    if (!seat || seat.gone) return
    socket.serializeAttachment({ ...seat, gone: true } satisfies Seat)
    this.announce()
  }

  /** Tells every peer in the room how many are in it. */
  private announce(): void {
    const peers = ROLES.map((role) => this.seated(role)).filter((socket) => socket !== undefined)
    const frame = presenceFrame(peers.length)
    for (const peer of peers) {
      try {
        peer.send(frame)
      } catch {
        // Going; its close announces again.
      }
    }
  }
}
