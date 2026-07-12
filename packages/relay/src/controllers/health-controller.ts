import type { FastifyPluginAsync } from 'fastify'

/** Uptime check for load balancers and monitors. */
export const healthController: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => 'ok')
}
