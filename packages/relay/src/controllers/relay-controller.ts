//Config
import { closeCode, config } from '../config/app'

//Helpers
import { holdsKey, mayOpen, roleOf, roomOf } from '../helpers/peer'
import { refuse } from '../helpers/refuse'

//Types
import type { Env } from '../types'

/**
 * The relay's only WebSocket route, `/?room=<id>&role=<host|device>`. It decides who the peer is
 * (turning away one with no room, or a host without the access key) and hands the socket to its
 * room, which joins it with the room's other peer.
 */
export async function relayController(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('soromi relay: connect with a WebSocket', { status: 426 })
  }

  const url = new URL(request.url)
  const room = roomOf(url.searchParams.get('room'))
  if (!room) return refuse(closeCode.missingRoom, 'missing room')

  const accessKey = env.RELAY_ACCESS_KEY
  const provided = request.headers.get(config.accessHeader)
  const role = roleOf(url.searchParams.get('role'), holdsKey(accessKey, provided))
  // Only a host holding the access key opens a room; a device joins one by its id and needs no
  // key, but its room checks that there is a host in it.
  if (role === 'host' && !mayOpen(accessKey, provided)) {
    return refuse(closeCode.unauthorized, 'unauthorized')
  }

  const headers = new Headers(request.headers)
  headers.set(config.roleHeader, role)
  const stub = env.ROOMS.get(env.ROOMS.idFromName(room))

  return stub.fetch(new Request(request, { headers }))
}
