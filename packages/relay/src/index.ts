//Controllers
import { healthController } from './controllers/health-controller'
import { relayController } from './controllers/relay-controller'

//Types
import type { Env } from './types'

export { Room } from './rooms/room'

/**
 * The Soromi relay, as a Cloudflare Worker: a stateless, content-blind pipe between a daemon and
 * its paired phone. Both dial out to it and meet in a room (a Durable Object, near them) by its
 * secret id; it forwards their frames, which are end-to-end encrypted between the two, verbatim.
 * No storage and no keys.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/health') return healthController(env)
    if (pathname === '/') return relayController(request, env)

    return new Response('not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
