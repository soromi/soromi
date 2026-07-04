import type { Status } from '@soromi/protocol'
import { parseStatus } from './status-parser'

/**
 * Daemon entrypoint, the product core. Phase 2 fills this in: PTY sessions
 * (node-pty), account-profile resolution, the status parser wired to live output,
 * keep-awake, and the WebSocket server that viewports attach to.
 */
export function main(): void {
  const status: Status = 'idle'
  console.log(`soromi daemon (skeleton), status: ${status}`)
  // Touch the parser so the cross-package wiring is exercised at build time.
  void parseStatus
}

main()
