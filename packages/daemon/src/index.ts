#!/usr/bin/env node
//
import { FileAccountManager } from './accounts/account-store'
import { DAEMON_PORT } from './config'
import { KeepAwakeController } from './keep-awake/keep-awake-controller'
import { createKeepAwake } from './keep-awake/keep-awake'
import { NotificationController } from './notifications/notification-controller'
import { createNotifier } from './notifications/notifier'
import { startWsServer } from './transport/ws-server'
import { WorkspaceService } from './workspaces/workspace-service'

/**
 * CLI entrypoint: `soromi [workspace-dir]`. Starts the WebSocket server viewports attach
 * over. A workspace dir is optional: given one, it opens immediately; otherwise the daemon
 * starts empty and workspaces are opened from the UI. Sessions run independently of any
 * viewport, so terminals survive the GUI closing.
 */
function main(): void {
  const notifications = new NotificationController(createNotifier())
  const keepAwake = new KeepAwakeController(createKeepAwake())
  const service = new WorkspaceService(notifications, keepAwake)

  const restored = service.names().length
  if (restored > 0) console.log(`soromi: restored ${restored} space(s) from local storage`)

  const dir = process.argv[2]
  if (dir) {
    try {
      const { workspace, warning } = service.openWorkspace(dir)
      console.log(`soromi: imported "${workspace}"${warning ? ` (${warning})` : ''}`)
    } catch (error) {
      console.error(`soromi: could not import ${dir}: ${(error as Error).message}`)
    }
  }

  startWsServer({ port: DAEMON_PORT, hub: service, accounts: new FileAccountManager() })
  console.log(`soromi: listening on ws://localhost:${DAEMON_PORT}`)

  const shutdown = () => {
    notifications.dispose()
    keepAwake.dispose()
    service.dispose()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
