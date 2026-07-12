import type { WebSocket, WebSocketServer } from 'ws'

import { config } from '../config/app.js'

/**
 * Keeps rooms from wedging on half-dead connections: each peer is pinged on an interval and
 * terminated if it did not answer the previous ping. This also frees a room slot so a reconnecting
 * peer is never blocked by its own ghost socket.
 */
export class Heartbeat {
  private readonly alive = new WeakSet<WebSocket>()

  /** Marks a peer alive and keeps it marked as it answers pings. */
  track(socket: WebSocket): void {
    this.alive.add(socket)
    socket.on('pong', () => this.alive.add(socket))
  }

  /** Starts pinging every peer on `server`; returns a stop function. */
  start(server: WebSocketServer): () => void {
    const timer = setInterval(() => {
      for (const socket of server.clients) {
        if (!this.alive.has(socket)) {
          socket.terminate()
          continue
        }
        this.alive.delete(socket)
        socket.ping()
      }
    }, config.heartbeatMs)
    timer.unref?.()
    return () => clearInterval(timer)
  }
}
