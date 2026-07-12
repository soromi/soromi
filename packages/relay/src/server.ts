import websocket from '@fastify/websocket'
import Fastify from 'fastify'

import { config } from './config/app.js'
import { healthController } from './controllers/health-controller.js'
import { relayController } from './controllers/relay-controller.js'
import { Heartbeat } from './rooms/heartbeat.js'
import { RoomRegistry } from './rooms/room-registry.js'

export interface Relay {
  /** The port actually bound (useful when `port: 0` picks an ephemeral one). */
  port: number
  close(): Promise<void>
}

export interface RelayOptions {
  port: number
  host?: string
}

/**
 * Builds and starts the relay: a stateless, content-blind pipe. Two peers dial in with the same
 * `?room=<id>` and their frames are cross-forwarded verbatim (the protocol's JSON now, E2EE blobs
 * later). No storage, no keys, security comes from the room id being secret and, next, the frames
 * being encrypted.
 */
export async function createRelay(options: RelayOptions): Promise<Relay> {
  const app = Fastify({ logger: false })
  await app.register(websocket, { options: { maxPayload: config.maxFrameBytes } })

  const registry = new RoomRegistry()
  const heartbeat = new Heartbeat()
  await app.register(healthController)
  await app.register(relayController(registry, heartbeat))

  const stopHeartbeat = heartbeat.start(app.websocketServer)
  app.addHook('onClose', async () => stopHeartbeat())

  await app.listen({ port: options.port, host: options.host ?? '0.0.0.0' })
  const address = app.server.address()
  const port = address && typeof address === 'object' ? address.port : options.port

  return { port, close: () => app.close() }
}
