import type { ClientMessage, ServerMessage } from '@soromi/protocol'

/**
 * The seam between a viewport and the daemon. Local (WebSocket) and remote
 * (E2EE-through-relay) implementations are interchangeable; nothing above this interface
 * knows which is in use.
 */
export interface Transport {
  connect(): void
  send(message: ClientMessage): void
  onMessage(listener: (message: ServerMessage) => void): () => void
  /** Fires with each piece of terminal output for an attached session. */
  onOutput(listener: (session: string, data: string) => void): () => void
  /** Fires each time the connection (re)opens. */
  onOpen(listener: () => void): () => void
  /**
   * Fires each time the connection drops, with the WebSocket close code. A relay says why it
   * turned a peer away through that code (see `relayClose`).
   */
  onClose(listener: (code: number) => void): () => void
  /**
   * Fires when the daemon peer attaches (`true`) or drops (`false`) on a relay link. A relay client
   * stays socket-connected to the relay even after the daemon quits, so this is how a remote
   * viewport learns the daemon went away. Never fires on a direct/local transport.
   */
  onPresence(listener: (present: boolean) => void): () => void
  isOpen(): boolean
  close(): void
}
