import type { FastifyPluginAsync } from 'fastify'

import { closeCode, config } from '../config/app.js'
import type { Heartbeat } from '../rooms/heartbeat.js'
import type { Role, RoomRegistry } from '../rooms/room-registry.js'

/**
 * The relay's only WebSocket route. Peers connect to `/?room=<id>&role=<host|device>`; a room's
 * host and device have their frames cross-forwarded. Content-blind end to end.
 *
 * `accessKey` is what a host must present to open a room; an empty one leaves the relay open.
 */
export function relayController(
  registry: RoomRegistry,
  heartbeat: Heartbeat,
  accessKey: string,
): FastifyPluginAsync {
  return async (app) => {
    app.get('/', { websocket: true }, (socket, request) => {
      const query = request.query as { room?: string; role?: string }
      const room = roomId(query.room)
      if (!room) {
        socket.close(closeCode.missingRoom, 'missing room')
        return
      }
      const provided = request.headers[config.accessHeader]
      const role = roleOf(query.role, accessKey !== '' && provided === accessKey)
      // Only a host holding the access key opens a room; a device joins one by its id and needs no
      // key, but there has to be a host in it.
      if (role === 'host' && accessKey !== '' && provided !== accessKey) {
        socket.close(closeCode.unauthorized, 'unauthorized')
        return
      }
      if (role === 'device' && !registry.hasHost(room)) {
        socket.close(closeCode.noHost, 'no host')
        return
      }
      // A peer that reconnects before its old socket is noticed dead takes that socket's place,
      // instead of waiting out the heartbeat for the slot to free up. The other side is told the
      // old one left before the new one arrives, because it is a new connection and has to be
      // greeted as one: whatever the two had set up between them went with the old socket.
      const stale = registry.evict(room, role)
      if (stale) {
        registry.announce(room)
        stale.close(closeCode.replaced, 'replaced')
      }
      registry.join(room, role, socket)
      heartbeat.track(socket)
      // Tell the room (both peers) that occupancy changed, so each side knows the other is present.
      registry.announce(room)

      socket.on('message', (data: Buffer, isBinary: boolean) =>
        registry.forward(room, socket, data, isBinary),
      )
      const leave = () => {
        if (registry.leave(room, socket)) registry.announce(room)
      }
      socket.on('close', leave)
      socket.on('error', () => {
        leave()
        socket.terminate()
      })
    })
  }
}

/** Validates and returns the room id, or `null` if missing or too long. */
function roomId(room: string | undefined): string | null {
  if (!room || room.length > config.maxRoomIdLength) return null
  return room
}

/**
 * The role a peer joins in. One that does not say is a build from before roles: there the daemon
 * is the peer that holds the access key.
 */
function roleOf(role: string | undefined, holdsKey: boolean): Role {
  if (role === 'host' || role === 'device') return role

  return holdsKey ? 'host' : 'device'
}
