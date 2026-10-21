/**
 * The two sides of a room: the `host` is the desktop daemon, the `device` is the phone paired with
 * it. A room holds at most one of each.
 */
export type Role = 'host' | 'device'

/** What a room keeps on each of its sockets, so it is still known after the room hibernates. */
export interface Seat {
  role: Role
  /** It left, or was replaced, and is on its way out: it holds no seat any more. */
  gone: boolean
}

/** The Worker's bindings (`wrangler.jsonc`) and secrets. */
export interface Env {
  /** The rooms, one Durable Object each, by room id. */
  ROOMS: DurableObjectNamespace
  /**
   * The secret a daemon must present to open a room (`wrangler secret put RELAY_ACCESS_KEY`). Only
   * the daemon holds it; a phone joins an existing room by id without it. Empty leaves the relay
   * open: anyone may open rooms. Unset turns every host away, so the relay is never gated by a
   * secret nobody chose.
   */
  RELAY_ACCESS_KEY?: string
}
