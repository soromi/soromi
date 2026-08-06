import { create } from 'zustand'

//Types
import type {
  AccountProfile,
  ChatEvent,
  KeepAwakeMode,
  SessionSummary,
  Skill,
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
const readDismissedUpdate = (): string | null => {
  try {
    return localStorage.getItem(DISMISSED_UPDATE_KEY)
  } catch {
    return null
  }
}

/**
 * The daemon-mirrored state, shared by every viewport (desktop and, later, web). It holds the
 * authoritative data the daemon streams and the app-level connection/update flags; navigation
 * (overlays, active workspace/tab, file tree) is a per-viewport concern kept out of here.
 */
interface ClientState {
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
  /** The assistant message streaming in right now, keyed by session id (cumulative text). Empty /
   * absent means nothing is mid-stream — the completed message lives in `chat`. */
  chatDelta: Record<string, string>
  /** Tool calls awaiting the user's allow/deny, keyed by session id. */
  chatApproval: Record<string, ToolApproval[]>
  /** Whether earlier messages exist on the daemon beyond what's loaded, keyed by session id (drives
   * the "Load earlier" button). */
  chatEarlier: Record<string, boolean>
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
  addSession: (workspace: string, session: SessionSummary) => void
  setMuted: (name: string, muted: boolean) => void
  setAccounts: (accounts: AccountProfile[]) => void
  setProviderStatus: (provider: string, configDir: string, loggedIn: boolean) => void
  setSkills: (session: string, skills: Skill[]) => void
  appendChat: (session: string, events: ChatEvent[]) => void
  prependChatHistory: (session: string, events: ChatEvent[], hasMore: boolean) => void
  resetChat: (session: string) => void
  setChatDelta: (session: string, text: string) => void
  addChatApproval: (session: string, approval: ToolApproval) => void
  removeChatApproval: (session: string, id: string) => void
  setUpdate: (update: AppUpdate) => void
  dismissUpdate: () => void
}

export const useClientStore = create<ClientState>()((set) => ({
  connected: false,
  ready: false,
  keepAwake: false,
  keepAwakeMode: 'off',
  workspaces: [],
  muted: {},
  accounts: [],
  providerStatus: {},
  skills: {},
  chat: {},
  chatDelta: {},
  chatApproval: {},
  chatEarlier: {},
  update: null,
  dismissedUpdate: readDismissedUpdate(),
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
  setProviderStatus: (provider, configDir, loggedIn) =>
    set((state) => ({
      providerStatus: { ...state.providerStatus, [`${provider}::${configDir}`]: loggedIn },
    })),
  setSkills: (session, skills) =>
    set((state) => ({ skills: { ...state.skills, [session]: skills } })),
  appendChat: (session, events) =>
    set((state) => ({
      chat: { ...state.chat, [session]: [...(state.chat[session] ?? []), ...events] },
      // A committed message supersedes whatever was streaming in.
      chatDelta: { ...state.chatDelta, [session]: '' },
    })),
  prependChatHistory: (session, events, hasMore) =>
    set((state) => ({
      chat: { ...state.chat, [session]: [...events, ...(state.chat[session] ?? [])] },
      chatEarlier: { ...state.chatEarlier, [session]: hasMore },
    })),
  resetChat: (session) =>
    set((state) => ({
      chat: { ...state.chat, [session]: [] },
      chatDelta: { ...state.chatDelta, [session]: '' },
      chatApproval: { ...state.chatApproval, [session]: [] },
      chatEarlier: { ...state.chatEarlier, [session]: false },
    })),
  setChatDelta: (session, text) =>
    set((state) => ({ chatDelta: { ...state.chatDelta, [session]: text } })),
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
      try {
        if (version) localStorage.setItem(DISMISSED_UPDATE_KEY, version)
      } catch {}
      return { dismissedUpdate: version }
    }),
}))
