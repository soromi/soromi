//Types
import type { ClientMessage, ServerMessage } from '@soromi/protocol'
import type { WorkspaceHub } from '../workspaces/workspace-service'

/**
 * Per-connection message routing, independent of the socket. A viewport lists and opens
 * workspaces, attaches to one, then its input/resize drives that session while output and
 * status stream back. The workspace list is re-sent whenever the hub changes. Kept
 * transport-free so it can be unit-tested without a real WebSocket.
 */
export function createConnection(hub: WorkspaceHub, send: (message: ServerMessage) => void) {
  const unsubscribers: Array<() => void> = []

  function sendWorkspaceList(): void {
    send({ type: 'workspace-list', workspaces: hub.summaries() })
  }

  unsubscribers.push(hub.onChange(sendWorkspaceList))

  function handle(message: ClientMessage): void {
    switch (message.type) {
      case 'list-workspaces': {
        sendWorkspaceList()
        return
      }
      case 'open-workspace': {
        try {
          const { workspace, warning } = hub.openWorkspace(message.dir)
          send({ type: 'workspace-opened', workspace, warning })
        } catch (error) {
          send({ type: 'error', message: (error as Error).message })
        }
        return
      }
      case 'create-space': {
        try {
          const { workspace, warning } = hub.createSpace({
            name: message.name,
            root: message.root,
            agent: message.agent,
            account: message.account,
            folders: message.folders,
          })
          send({ type: 'workspace-opened', workspace, warning })
        } catch (error) {
          send({ type: 'error', message: (error as Error).message })
        }
        return
      }
      case 'remove-space': {
        hub.removeSpace(message.workspace)
        return
      }
      case 'mute-workspace': {
        hub.setMuted(message.workspace, message.muted)
        return
      }
      case 'list-dir': {
        send({
          type: 'dir-listing',
          workspace: message.workspace,
          path: message.path,
          entries: hub.listDir(message.workspace, message.path),
        })
        return
      }
      case 'read-file': {
        const file = hub.readFile(message.workspace, message.path)
        send({
          type: 'file-content',
          workspace: message.workspace,
          path: message.path,
          content: file.content,
          truncated: file.truncated,
          binary: file.binary,
        })
        return
      }
      case 'attach': {
        const session = hub.get(message.workspace)
        if (!session) return
        send({ type: 'output', workspace: message.workspace, data: session.snapshot() })
        send({ type: 'status', workspace: message.workspace, status: session.status() })
        unsubscribers.push(
          session.onOutput((data) => {
            send({ type: 'output', workspace: message.workspace, data })
          }),
          session.onStatus((status) => {
            send({ type: 'status', workspace: message.workspace, status })
          }),
        )
        return
      }
      case 'input': {
        hub.get(message.workspace)?.write(message.data)
        return
      }
      case 'resize': {
        hub.get(message.workspace)?.resize(message.cols, message.rows)
        return
      }
    }
  }

  function dispose(): void {
    for (const unsubscribe of unsubscribers) unsubscribe()
    unsubscribers.length = 0
  }

  return { handle, dispose }
}
