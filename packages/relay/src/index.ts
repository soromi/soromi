import { config } from './config/app.js'
import { createRelay } from './server.js'

/** Entry point: start the relay on the configured port, bound to all interfaces. */
createRelay({ port: config.port }).then((relay) => {
  console.log(`soromi-relay: listening on :${relay.port}`)
})
