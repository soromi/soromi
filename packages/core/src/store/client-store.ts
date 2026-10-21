import { createStore } from 'zustand/vanilla'

//Utils
import { appendEvents, withFile } from './chat-log'

//Types
import type { ModelCatalog } from '../chat/models'
import type {
  AccountProfile,
  ChatCursor,
  ChatEvent,
  ChatFile,
  KeepAwakeMode,
  SessionSummary,
  Skill,
  SlashCommand,
  Status,
  ToolApproval,
  WorkspaceSummary,
} from '@soromi/protocol'

export type WorkspaceInfo = WorkspaceSummary

/** A newer release the daemon found. Notify-only: `url` opens the release page. */
export interface AppUpdate {
  version: string
  url: string
  notes: string | null
}

/** The workspace's rail status: the most attention-worthy of its sessions. */
function aggregateStatus(sessions: SessionSummary[]): Status {
  const has = (status: Status) => sessions.some((s) => s.status === status)
  if (has('thinking')) return 'thinking'
  if (has('waiting-input')) return 'waiting-input'
  if (has('blocked')) return 'blocked'
  if (has('done')) return 'done'
  return 'idle'
}

/** Remembers the last update version the user dismissed, so it stays hidden until a newer one. */
const DISMISSED_UPDATE_KEY = 'soromi.dismissedUpdate'

/**
 * Somewhere to keep a few small values between runs. The host supplies it (local storage in a
 * webview); without one, nothing is remembered.
 */
export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export interface ClientStoreOptions {
  storage?: KeyValueStorage
}

/**
 * The daemon-mirrored state, shared by every viewport (the desktop app and the mobile app). It
 * holds the authoritative data the daemon streams and the app-level connection/update flags;
 * navigation (overlays, active workspace/tab, file tree) is a per-viewport concern kept out of here.
 */
export interface ClientState {
  connected: boolean
  /** True once the first workspace list has arrived, so the shell can wait behind a splash. */
  ready: boolean
  keepAwake: boolean
  keepAwakeMode: KeepAwakeMode
  workspaces: WorkspaceInfo[]
  muted: Record<string, boolean>
  accounts: AccountProfile[]
  /** Whether a provider's config dir looks logged in, keyed by `provider::configDir`. */
  providerStatus: Record<string, boolean>
  /** Skills for a session, keyed by session id. */
  skills: Record<string, Skill[]>
  /** Structured transcript events for the chat view, keyed by session id (Claude sessions only).
   * Empty/absent means no transcript, so the viewport falls back to the terminal. */
  chat: Record<string, ChatEvent[]>
  /** How far each session's chat goes in the daemon's log: the run of the log it belongs to and the
   * place of its last event. Sent back on attach, so a reconnect is only sent what was missed. */
  chatCursor: Record<string, ChatCursor>
  /** The assistant message streaming in right now, keyed by session id (the text so far, built up
   * from the pieces the daemon sends). Empty / absent means nothing is mid-stream — the completed
   * message lives in `chat`. */
  chatDelta: Record<string, string>
  /** The slash commands a chat session's provider exposes (the composer's `/` menu), by session id. */
  commands: Record<string, SlashCommand[]>
  /** Tool calls awaiting the user's allow/deny, keyed by session id. */
  chatApproval: Record<string, ToolApproval[]>
  /** Whether earlier messages exist on the daemon beyond what's loaded, keyed by session id (drives
   * the "Load earlier" button). */
  chatEarlier: Record<string, boolean>
  /** Every provider's models, as the daemon lists them. Empty until its catalog arrives. */
  models: ModelCatalog
  /** Bumped each time the daemon's model catalog is (re)applied — a reactivity signal so the composer
   * re-renders when the catalog (held in `@soromi/ui`) lands, since that store lives outside React. */
  modelCatalogVersion: number
  /** A newer release, once the daemon reports one. */
  update: AppUpdate | null
  /** The update version the user dismissed; the banner stays hidden while it matches. */
  dismissedUpdate: string | null
  /** Who controls the terminals: `null` = this viewport does (render it); otherwise the name of the
   * device in control (show a takeover). */
  controlHolder: string | null
  setControlHolder: (holder: string | null) => void
  setConnected: (connected: boolean) => void
  setKeepAwake: (keepAwake: boolean) => void
  setKeepAwakeMode: (mode: KeepAwakeMode) => void
  setWorkspaces: (workspaces: WorkspaceInfo[]) => void
  setSessionStatus: (session: string, status: Status) => void
  /** One session changed: swap in its new summary and the workspace's new aggregate status. */
  updateSession: (workspace: string, status: Status, session: SessionSummary) => void
  addSession: (workspace: string, session: SessionSummary) => void
  setMuted: (name: string, muted: boolean) => void
  setAccounts: (accounts: AccountProfile[]) => void
  setProviderStatus: (provider: string, configDir: string, loggedIn: boolean) => void
  setModels: (models: ModelCatalog) => void
  bumpModelCatalog: () => void
  setSkills: (session: string, skills: Skill[]) => void
  /** Events for the end of a session's chat; `seq` is the place of the last one in the log. */
  appendChat: (session: string, events: ChatEvent[], seq: number) => void
  prependChatHistory: (session: string, events: ChatEvent[], hasMore: boolean) => void
  /** The chat held for a session is void: start over at `seq` of the run of the log named `log`. */
  resetChat: (session: string, log: string, seq: number) => void
  /** The chat held for a session is still good; its approvals and streaming text are sent again. */
  resumeChat: (session: string) => void
  /** The bytes of an attached file arrived: put it in place of its stub. */
  setChatFile: (session: string, log: string, seq: number, index: number, file: ChatFile) => void
  /** Streaming text arrived: add it to the live message, or replace the live message with it. */
  applyChatDelta: (session: string, text: string, replace: boolean) => void
  setCommands: (session: string, commands: SlashCommand[]) => void
  addChatApproval: (session: string, approval: ToolApproval) => void
  removeChatApproval: (session: string, id: string) => void
  setUpdate: (update: AppUpdate) => void
  dismissUpdate: () => void
}

/** A store holding what one daemon streams. Each app makes one and binds it to its own UI. */
export type ClientStore = ReturnType<typeof createClientStore>

export const createClientStore = (options: ClientStoreOptions = {}) =>
  createStore<ClientState>()((set) => ({
    connected: false,
    ready: false,
    keepAwake: false,
    keepAwakeMode: 'off',
    workspaces: [],
    muted: {},
    accounts: [],
    providerStatus: {},
    models: {},
    modelCatalogVersion: 0,
    skills: {},
    chat: {},
    chatCursor: {},
    chatDelta: {},
    commands: {},
    chatApproval: {},
    chatEarlier: {},
    update: null,
    dismissedUpdate: options.storage?.get(DISMISSED_UPDATE_KEY) ?? null,
    controlHolder: null,
    setControlHolder: (controlHolder) => set({ controlHolder }),
    setConnected: (connected) => set({ connected }),
    setKeepAwake: (keepAwake) => set({ keepAwake }),
    setKeepAwakeMode: (keepAwakeMode) => set({ keepAwakeMode }),
    setWorkspaces: (workspaces) => set({ workspaces, ready: true }),
    setSessionStatus: (session, status) =>
      set((state) => ({
        workspaces: state.workspaces.map((w) => {
          if (!w.sessions.some((s) => s.id === session)) return w
          const sessions = w.sessions.map((s) => (s.id === session ? { ...s, status } : s))
          return { ...w, sessions, status: aggregateStatus(sessions) }
        }),
      })),
    updateSession: (workspace, status, session) =>
      set((state) => ({
        // Only the changed workspace and session get new objects, so rows for the rest don't re-render.
        workspaces: state.workspaces.map((w) =>
          w.name === workspace
            ? { ...w, status, sessions: w.sessions.map((s) => (s.id === session.id ? session : s)) }
            : w,
        ),
      })),
    addSession: (workspace, session) =>
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.name === workspace && !w.sessions.some((s) => s.id === session.id)
            ? { ...w, sessions: [...w.sessions, session] }
            : w,
        ),
      })),
    setMuted: (name, muted) => set((state) => ({ muted: { ...state.muted, [name]: muted } })),
    setAccounts: (accounts) => set({ accounts }),
    setModels: (models) => set({ models }),
    bumpModelCatalog: () =>
      set((state) => ({ modelCatalogVersion: state.modelCatalogVersion + 1 })),
    setProviderStatus: (provider, configDir, loggedIn) =>
      set((state) => ({
        providerStatus: { ...state.providerStatus, [`${provider}::${configDir}`]: loggedIn },
      })),
    setSkills: (session, skills) =>
      set((state) => ({ skills: { ...state.skills, [session]: skills } })),
    appendChat: (session, events, seq) =>
      set((state) => {
        const held = { events: state.chat[session] ?? [], cursor: state.chatCursor[session] }
        const next = appendEvents(held, events, seq)
        if (next === held || !next.cursor) return {}

        return {
          chat: { ...state.chat, [session]: next.events },
          chatCursor: { ...state.chatCursor, [session]: next.cursor },
          // A committed message supersedes whatever was streaming in.
          chatDelta: { ...state.chatDelta, [session]: '' },
        }
      }),
    prependChatHistory: (session, events, hasMore) =>
      set((state) => ({
        chat: { ...state.chat, [session]: [...events, ...(state.chat[session] ?? [])] },
        chatEarlier: { ...state.chatEarlier, [session]: hasMore },
      })),
    resetChat: (session, log, seq) =>
      set((state) => ({
        chat: { ...state.chat, [session]: [] },
        chatCursor: { ...state.chatCursor, [session]: { log, seq } },
        chatDelta: { ...state.chatDelta, [session]: '' },
        chatApproval: { ...state.chatApproval, [session]: [] },
        chatEarlier: { ...state.chatEarlier, [session]: false },
      })),
    resumeChat: (session) =>
      set((state) => ({
        chatDelta: { ...state.chatDelta, [session]: '' },
        chatApproval: { ...state.chatApproval, [session]: [] },
      })),
    setChatFile: (session, log, seq, index, file) =>
      set((state) => {
        const held = state.chat[session] ?? []
        const events = withFile(
          { events: held, cursor: state.chatCursor[session] },
          log,
          seq,
          index,
          file,
        )

        return events === held ? {} : { chat: { ...state.chat, [session]: events } }
      }),
    applyChatDelta: (session, text, replace) =>
      set((state) => ({
        chatDelta: {
          ...state.chatDelta,
          [session]: replace ? text : (state.chatDelta[session] ?? '') + text,
        },
      })),
    setCommands: (session, commands) =>
      set((state) => ({ commands: { ...state.commands, [session]: commands } })),
    addChatApproval: (session, approval) =>
      set((state) => {
        const current = state.chatApproval[session] ?? []
        if (current.some((a) => a.id === approval.id)) return state
        return { chatApproval: { ...state.chatApproval, [session]: [...current, approval] } }
      }),
    removeChatApproval: (session, id) =>
      set((state) => ({
        chatApproval: {
          ...state.chatApproval,
          [session]: (state.chatApproval[session] ?? []).filter((a) => a.id !== id),
        },
      })),
    setUpdate: (update) => set({ update }),
    dismissUpdate: () =>
      set((state) => {
        const version = state.update?.version ?? null
        if (version) options.storage?.set(DISMISSED_UPDATE_KEY, version)
        return { dismissedUpdate: version }
      }),
  }))
