import { agentLogKey, contextLimit } from '@soromi/core'
import { useStore } from 'zustand'

//State
import { DaemonStore } from './daemon.state'

/**
 * @description Every workspace on the computer, with its sessions
 */
export const useDaemonWorkspaces = () => useStore(DaemonStore, (state) => state.workspaces)

/**
 * @description One workspace by name, as the computer last listed it; `undefined` if it has none
 * by that name
 */
export const useDaemonWorkspace = (name: string) =>
  useStore(DaemonStore, (state) => state.workspaces.find((workspace) => workspace.name === name))

/**
 * @description Whether the first workspace list has arrived
 */
export const useDaemonReady = () => useStore(DaemonStore, (state) => state.ready)

/**
 * @description The computer the phone is paired with, and what runs its daemon (the desktop app,
 * a terminal, a service); `null` until it has said
 */
export const useDaemonHost = () => useStore(DaemonStore, (state) => state.host)

/**
 * @description The release of Soromi the computer runs; `null` until it has said
 */
export const useDaemonVersion = () => useStore(DaemonStore, (state) => state.daemonVersion)

/**
 * @description One session's summary, wherever it lives
 */
export const useDaemonSession = (id: string) =>
  useStore(DaemonStore, (state) =>
    state.workspaces.flatMap((workspace) => workspace.sessions).find((s) => s.id === id),
  )

/**
 * @description The folder on the computer a workspace's paths are relative to
 */
export const useDaemonWorkspaceRoot = (workspace: string) =>
  useStore(DaemonStore, (state) => state.workspaces.find((w) => w.name === workspace)?.root)

/**
 * @description The folders a workspace is made of, relative to its root (`.` is the root itself)
 */
export const useDaemonWorkspaceFolders = (workspace: string) =>
  useStore(DaemonStore, (state) => state.workspaces.find((w) => w.name === workspace)?.folders)

/**
 * @description A workspace's terminals, as the daemon lists them for every device; `undefined`
 * when it has none
 */
export const useDaemonWorkspaceShells = (workspace: string) =>
  useStore(DaemonStore, (state) => state.workspaces.find((w) => w.name === workspace)?.shells)

/**
 * @description The plan usage of a workspace's agents, as the computer last read it; `undefined`
 * until it answers
 */
export const useDaemonUsage = (workspace: string) =>
  useStore(DaemonStore, (state) => state.usage[workspace])

/**
 * @description What a watched background agent of a session did, as far as the daemon has sent
 * it; `undefined` until it answers
 */
export const useDaemonAgentLog = (session: string, agent: string) =>
  useStore(DaemonStore, (state) => state.agentLogs[agentLogKey(session, agent)])

/**
 * @description One of a session's background agents while the session lists it as at work;
 * `undefined` once it has stopped
 */
export const useDaemonListedAgent = (session: string, agent: string) =>
  useStore(DaemonStore, (state) => {
    for (const workspace of state.workspaces) {
      const listed = workspace.sessions
        .find((one) => one.id === session)
        ?.subagents?.find((sub) => sub.id === agent)
      if (listed) return listed
    }

    return undefined
  })

/**
 * @description The name of the workspace a session belongs to
 */
export const useDaemonWorkspaceName = (session: string) =>
  useStore(
    DaemonStore,
    (state) => state.workspaces.find((w) => w.sessions.some((s) => s.id === session))?.name,
  )

/**
 * @description Which account each agent runs under, in the workspace a session belongs to
 */
export const useDaemonBindings = (session: string) =>
  useStore(
    DaemonStore,
    (state) => state.workspaces.find((w) => w.sessions.some((s) => s.id === session))?.accounts,
  )

/**
 * @description The account profiles on the computer, empty until the daemon has sent them
 */
export const useDaemonAccounts = () => useStore(DaemonStore, (state) => state.accounts)

/**
 * @description A provider's models, or `undefined` when it lists none or the list has not arrived
 */
export const useDaemonModels = (agent: string | undefined) =>
  useStore(DaemonStore, (state) => (agent ? state.models[agent] : undefined))

/**
 * @description The size of the context window a session's model has
 */
export const useDaemonContextLimit = (agent: string | undefined, model: string | null) =>
  useStore(DaemonStore, (state) => contextLimit(state.models, agent, model))

/**
 * @description The slash commands a session's provider offers, once the daemon has sent them
 */
export const useDaemonCommands = (id: string) =>
  useStore(DaemonStore, (state) => state.commands[id])

/**
 * @description How far a session's chat goes in the daemon's log, which names the files in it
 */
export const useDaemonChatCursor = (id: string) =>
  useStore(DaemonStore, (state) => state.chatCursor[id])

/**
 * @description The chat events held for a session
 */
export const useDaemonChat = (id: string) => useStore(DaemonStore, (state) => state.chat[id])

/**
 * @description The reply streaming in for a session, empty when nothing is
 */
export const useDaemonStreaming = (id: string) =>
  useStore(DaemonStore, (state) => state.chatDelta[id] ?? '')

/**
 * @description Tool calls in a session waiting to be allowed or denied
 */
export const useDaemonApprovals = (id: string) =>
  useStore(DaemonStore, (state) => state.chatApproval[id])

/**
 * @description Whether the daemon holds messages older than the ones loaded
 */
export const useDaemonHasEarlier = (id: string) =>
  useStore(DaemonStore, (state) => state.chatEarlier[id] ?? false)

/**
 * @description A workspace's earlier conversations as the daemon last listed them, with the
 * search they answer; `undefined` until it has
 */
export const useDaemonConversations = (workspace: string) =>
  useStore(DaemonStore, (state) => state.conversations[workspace])

/**
 * @description A session's slash commands and skills, once the daemon has sent them
 */
export const useDaemonSkills = (id: string) => useStore(DaemonStore, (state) => state.skills[id])

/**
 * @description The device in control of the sessions, or `null` when it is this phone
 */
export const useDaemonControlHolder = () => useStore(DaemonStore, (state) => state.controlHolder)

/**
 * @description Whether this phone is in control of the sessions
 */
export const useDaemonInControl = () =>
  useStore(DaemonStore, (state) => state.controlHolder === null)
