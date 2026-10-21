import { config } from './config/app.js'
import { createRelay } from './server.js'

/**
 * Entry point: start the relay on the configured port, bound to all interfaces. The access key has
 * no built-in value, so a relay is never gated by a secret its operator did not choose.
 */
const accessKey = process.env.RELAY_ACCESS_KEY
if (accessKey === undefined) {
  console.error(
    'soromi-relay: RELAY_ACCESS_KEY is not set. Set it to the secret your daemon presents ' +
      '(Settings -> Remote -> "Relay access key"), or to an empty value to run an open relay.',
  )
  process.exit(1)
}

createRelay({ port: config.port, accessKey }).then((relay) => {
  const gate = accessKey === '' ? 'open (no access key)' : 'access key required'
  console.log(`soromi-relay: listening on :${relay.port}, ${gate}`)
})
