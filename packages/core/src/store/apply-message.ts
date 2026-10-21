//Utils
import { normalizeModelCatalog } from '../chat/models'

//Types
import type { ServerMessage } from '@soromi/protocol'
import type { ClientState } from './client-store'

/**
 * Routes a message from the daemon into the store: everything that is the daemon's state rather
 * than one app's own (navigation, banners, the file tree). Each app calls this for every message
 * and then handles the few that concern its UI.
 */
export function applyServerMessage(client: ClientState, message: ServerMessage): void {
  switch (message.type) {
    case 'workspace-list':
      client.setWorkspaces(message.workspaces)
      break
    case 'keep-awake':
      client.setKeepAwake(message.active)
      client.setKeepAwakeMode(message.mode)
      break
    case 'account-list':
      client.setAccounts(message.accounts)
      break
    case 'model-catalog':
      client.setModels(normalizeModelCatalog(message.catalog))
      break
    case 'provider-status':
      client.setProviderStatus(message.provider, message.configDir, message.loggedIn)
      break
    case 'session-updated':
      client.updateSession(message.workspace, message.status, message.session)
      break
    case 'session-commands':
      client.setCommands(message.session, message.commands)
      break
    case 'status':
      client.setSessionStatus(message.session, message.status)
      break
    case 'chat':
      client.appendChat(message.session, message.events, message.seq)
      break
    case 'chat-reset':
      client.resetChat(message.session, message.log, message.seq)
      break
    case 'chat-resumed':
      client.resumeChat(message.session)
      break
    case 'chat-file-data':
      client.setChatFile(message.session, message.log, message.seq, message.index, message.file)
      break
    case 'chat-delta':
      client.applyChatDelta(message.session, message.text, message.replace ?? false)
      break
    case 'chat-approval':
      client.addChatApproval(message.session, message.approval)
      break
    case 'chat-approval-resolved':
      client.removeChatApproval(message.session, message.id)
      break
    case 'chat-history':
      client.prependChatHistory(message.session, message.events, message.hasMore)
      break
    case 'session-opened':
      client.addSession(message.workspace, message.session)
      break
    case 'skill-list':
      client.setSkills(message.session, message.skills)
      break
    case 'update-available':
      client.setUpdate({
        version: message.version,
        url: message.url,
        notes: message.notes ?? null,
      })
      break
    case 'control':
      client.setControlHolder(message.holder ?? null)
      break
  }
}
