//Types
import type { ClientMessage, ServerMessage } from '@soromi/protocol'
import type { AccountManager } from '../accounts/account-store'
import type { WorkspaceHub } from '../workspaces/workspace-service'

/**
 * Per-connection message routing, independent of the socket. A viewport lists and opens
 * workspaces, attaches to one, then its input/resize drives that session while output and
 * status stream back. The workspace list is re-sent whenever the hub changes. Kept
 * transport-free so it can be unit-tested without a real WebSocket.
 */
export function createConnection(
  hub: WorkspaceHub,
  send: (message: ServerMessage) => void,
  accounts?: AccountManager,
) {
  const unsubscribers: Array<() => void> = []
  const attached = new Map<string, () => void>()

  function sendAccounts(): void {
    if (accounts) send({ type: 'account-list', accounts: accounts.list() })
  }

  function sendState(): void {
    send({ type: 'workspace-list', workspaces: hub.summaries() })
    send({ type: 'keep-awake', active: hub.keepAwakeActive(), mode: hub.keepAwakeMode() })
  }

  unsubscribers.push(hub.onChange(sendState))

  function handle(message: ClientMessage): void {
    switch (message.type) {
      case 'list-workspaces': {
        sendState()
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
      case 'set-keep-awake-mode': {
        hub.setKeepAwakeMode(message.mode)
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
      case 'list-accounts': {
        sendAccounts()
        return
      }
      case 'save-account': {
        accounts?.save(message.profile)
        sendAccounts()
        return
      }
      case 'delete-account': {
        accounts?.remove(message.name)
        sendAccounts()
        return
      }
      case 'attach': {
        const session = hub.get(message.workspace)
        if (!session) return
        // Re-attaching (e.g. on reconnect) replaces the prior subscription, so output is
        // never streamed twice for the same workspace on one connection.
        attached.get(message.workspace)?.()
        send({ type: 'output', workspace: message.workspace, data: session.snapshot() })
        send({ type: 'status', workspace: message.workspace, status: session.status() })
        const offOutput = session.onOutput((data) => {
          send({ type: 'output', workspace: message.workspace, data })
        })
        const offStatus = session.onStatus((status) => {
          send({ type: 'status', workspace: message.workspace, status })
        })
        attached.set(message.workspace, () => {
          offOutput()
          offStatus()
        })
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
    for (const off of attached.values()) off()
    attached.clear()
  }

  return { handle, dispose }
}
