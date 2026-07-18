import type { FastifyPluginAsync } from 'fastify'

import { config } from '../config/app.js'
import type { Heartbeat } from '../rooms/heartbeat.js'
import type { RoomRegistry } from '../rooms/room-registry.js'

/**
 * The relay's only WebSocket route. Peers connect to `/?room=<id>`; the first two in a room are
 * paired and their frames cross-forwarded, a third is refused. Content-blind end to end.
 */
export function relayController(registry: RoomRegistry, heartbeat: Heartbeat): FastifyPluginAsync {
  return async (app) => {
    app.get('/', { websocket: true }, (socket, request) => {
      const room = roomId((request.query as { room?: string }).room)
      if (!room) {
        socket.close(4000, 'missing room')
        return
      }
      // Creating a room (being its first peer) requires the access key; joining an existing room
      // does not. So only an authenticated daemon opens a room, and a phone joins it by id.
      if (registry.size(room) === 0 && !authorized(request.headers[config.accessHeader])) {
        socket.close(4003, 'unauthorized')
        return
      }
      if (registry.join(room, socket) === 'full') {
        socket.close(4001, 'room full')
        return
      }
      heartbeat.track(socket)
      // Tell the room (both peers) that occupancy changed, so each side knows the other is present.
      registry.announce(room)

      socket.on('message', (data: Buffer, isBinary: boolean) =>
        registry.forward(room, socket, data, isBinary),
      )
      const leave = () => {
        registry.leave(room, socket)
        registry.announce(room)
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

/** Whether a request may create a room. An empty configured key disables the gate. */
function authorized(provided: string | string[] | undefined): boolean {
  if (!config.accessKey) return true
  return provided === config.accessKey
}
