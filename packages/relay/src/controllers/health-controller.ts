//Types
import type { Env } from '../types'

/** `GET /health`, for uptime checks: `ok`, or `503` while the relay has no access key set. */
export function healthController(env: Env): Response {
  if (env.RELAY_ACCESS_KEY === undefined) {
    return new Response('RELAY_ACCESS_KEY is not set', { status: 503 })
  }

  return new Response('ok')
}
