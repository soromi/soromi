import type { WebSocket } from 'ws'

import { config } from '../config/app.js'

/**
 * The two sides of a room: the `host` is the desktop daemon, the `device` is the phone paired with
 * it. A room holds at most one of each.
 */
export type Role = 'host' | 'device'

type Room = Partial<Record<Role, WebSocket>>

const other = (role: Role): Role => (role === 'host' ? 'device' : 'host')

/**
 * Tracks which peers are in which room and forwards frames between them. Content-blind: it never
 * inspects a frame, only relays it to the room's other peer. Holds no persistence.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>()

  /** Puts a peer into a room in the given role, which must be free (see `evict`). */
  join(room: string, role: Role, socket: WebSocket): void {
    let peers = this.rooms.get(room)
    if (!peers) {
      peers = {}
      this.rooms.set(room, peers)
    }
    peers[role] = socket
  }

  /**
   * Takes the socket holding a role out of its room and returns it, if there is one. It is the
   * same peer's earlier connection (the peer reconnected before the old socket was noticed dead),
   * so the caller closes it and lets the new socket have the role.
   */
  evict(room: string, role: Role): WebSocket | undefined {
    const socket = this.rooms.get(room)?.[role]
    if (socket) this.leave(room, socket)

    return socket
  }

  /** Whether a room has its host. */
  hasHost(room: string): boolean {
    return this.rooms.get(room)?.host !== undefined
  }

  /**
   * Removes a peer and drops the room once empty. Returns whether the peer was still in the room:
   * a socket that was displaced has already left it.
   */
  leave(room: string, socket: WebSocket): boolean {
    const peers = this.rooms.get(room)
    if (!peers) return false
    const role = roleOf(peers, socket)
    if (!role) return false
    delete peers[role]
    if (!peers.host && !peers.device) this.rooms.delete(room)

    return true
  }

  /**
   * Forwards a frame to the room's other peer, verbatim. A peer with too much already waiting is
   * not keeping up: it is dropped instead of being buffered for.
   */
  forward(room: string, from: WebSocket, data: Buffer, isBinary: boolean): void {
    const peers = this.rooms.get(room)
    if (!peers) return
    const role = roleOf(peers, from)
    if (!role) return
    const peer = peers[other(role)]
    if (!peer || peer.readyState !== peer.OPEN) return
    if (peer.bufferedAmount > config.maxBufferedBytes) {
      peer.terminate()
      return
    }
    peer.send(data, { binary: isBinary })
  }

  /**
   * Announces the room's current peer count to every peer as a text control frame
   * (`{"__relay":"presence","peers":n}`), so a peer can tell when the other side attaches or drops.
   * Presence metadata only, never content: the relay stays content-blind.
   */
  announce(room: string): void {
    const peers = this.rooms.get(room)
    if (!peers) return
    const frame = JSON.stringify({ __relay: 'presence', peers: this.size(room) })
    for (const peer of [peers.host, peers.device]) {
      if (peer && peer.readyState === peer.OPEN) peer.send(frame)
    }
  }

  /** How many peers are in a room. */
  size(room: string): number {
    const peers = this.rooms.get(room)
    if (!peers) return 0

    return (peers.host ? 1 : 0) + (peers.device ? 1 : 0)
  }
}

/** The role a socket holds in a room, if it is in it. */
function roleOf(peers: Room, socket: WebSocket): Role | undefined {
  if (peers.host === socket) return 'host'
  if (peers.device === socket) return 'device'

  return undefined
}
