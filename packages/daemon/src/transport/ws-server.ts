import { WebSocket, WebSocketServer } from 'ws'

//Packages
import { ClientMessageSchema, type ServerMessage } from '@soromi/protocol'

//
import { createConnection } from './connection'

//Types
import type { AccountManager } from '../accounts/account-store'
import type { WorkspaceHub } from '../workspaces/workspace-service'

export interface WsServerOptions {
  port: number
  hub: WorkspaceHub
  accounts: AccountManager
}

/** Starts the WebSocket server that viewports attach over. */
export function startWsServer({ port, hub, accounts }: WsServerOptions): WebSocketServer {
  const wss = new WebSocketServer({ port })

  wss.on('connection', (socket) => {
    const send = (message: ServerMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    }
    const connection = createConnection(hub, send, accounts)

    socket.on('message', (raw) => {
      const parsed = ClientMessageSchema.safeParse(parseJson(raw.toString()))
      if (parsed.success) connection.handle(parsed.data)
    })
    socket.on('close', () => connection.dispose())
  })

  return wss
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
