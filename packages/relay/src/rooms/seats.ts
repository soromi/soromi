//Types
import type { Role } from '../types'

/** Both roles, the host first. */
export const ROLES: Role[] = ['host', 'device']

/** The role a frame from `role` goes to. */
export const other = (role: Role): Role => (role === 'host' ? 'device' : 'host')

/**
 * The frame that tells a room's peers how many are in it, so each knows when the other arrives or
 * drops. Presence only, never content.
 */
export const presenceFrame = (peers: number): string =>
  JSON.stringify({ __relay: 'presence', peers })
