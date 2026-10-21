//Config
import { config } from '../config/app'

//Types
import type { Role } from '../types'

/** The room a peer asks for, or `null` for none, or one too long to be a room's id. */
export function roomOf(room: string | null): string | null {
  if (!room || room.length > config.maxRoomIdLength) return null

  return room
}

/** Whether a peer presents the access key. Only a key that is set, and not empty, can be held. */
export function holdsKey(accessKey: string | undefined, provided: string | null): boolean {
  return !!accessKey && provided === accessKey
}

/** Whether a host may open a room: it holds the key, or the relay is open (an empty key). */
export function mayOpen(accessKey: string | undefined, provided: string | null): boolean {
  return accessKey === '' || holdsKey(accessKey, provided)
}

/**
 * The role a peer joins in. One that does not say is a build from before roles: there the daemon
 * is the peer that holds the access key.
 */
export function roleOf(asked: string | null, holdsKey: boolean): Role {
  if (asked === 'host' || asked === 'device') return asked

  return holdsKey ? 'host' : 'device'
}
