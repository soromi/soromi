import type { WebSocket } from 'ws'

import { config } from '../config/app.js'

/** Result of trying to place a peer into a room. */
export type JoinResult = 'joined' | 'full'

/**
 * Tracks which peers are in which room and forwards frames between them. Content-blind: it never
 * inspects a frame, only relays it to the room's other peer(s). Holds no persistence.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Set<WebSocket>>()

  /** Adds a peer to a room, unless the room is already full. */
  join(room: string, socket: WebSocket): JoinResult {
    let peers = this.rooms.get(room)
    if (!peers) {
      peers = new Set()
      this.rooms.set(room, peers)
    }
    if (peers.size >= config.maxPeersPerRoom) {
      return 'full'
    }
    peers.add(socket)
    return 'joined'
  }

  /** Removes a peer; drops the room once empty. */
  leave(room: string, socket: WebSocket): void {
    const peers = this.rooms.get(room)
    if (!peers) return
    peers.delete(socket)
    if (peers.size === 0) this.rooms.delete(room)
  }

  /** Forwards a frame to every other open peer in the room, verbatim. */
  forward(room: string, from: WebSocket, data: Buffer, isBinary: boolean): void {
    const peers = this.rooms.get(room)
    if (!peers) return
    for (const peer of peers) {
      if (peer !== from && peer.readyState === peer.OPEN) {
        peer.send(data, { binary: isBinary })
      }
    }
  }

  /** How many peers are in a room (for tests/metrics). */
  size(room: string): number {
    return this.rooms.get(room)?.size ?? 0
  }
}
