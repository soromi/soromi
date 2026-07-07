import { create } from 'zustand'

//Types
import type {
  AccountProfile,
  KeepAwakeMode,
  SessionSummary,
  Skill,
  Status,
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
  keepAwake: boolean
  keepAwakeMode: KeepAwakeMode
  workspaces: WorkspaceInfo[]
  muted: Record<string, boolean>
  accounts: AccountProfile[]
  /** Whether a provider's config dir looks logged in, keyed by `provider::configDir`. */
  providerStatus: Record<string, boolean>
  /** Skills for a session, keyed by session id. */
  skills: Record<string, Skill[]>
  /** A newer release, once the daemon reports one. */
  update: AppUpdate | null
  /** The update version the user dismissed; the banner stays hidden while it matches. */
  dismissedUpdate: string | null
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
  setUpdate: (update: AppUpdate) => void
  dismissUpdate: () => void
}

export const useClientStore = create<ClientState>()((set) => ({
  connected: false,
  keepAwake: false,
  keepAwakeMode: 'off',
  workspaces: [],
  muted: {},
  accounts: [],
  providerStatus: {},
  skills: {},
  update: null,
  dismissedUpdate: readDismissedUpdate(),
  setConnected: (connected) => set({ connected }),
  setKeepAwake: (keepAwake) => set({ keepAwake }),
  setKeepAwakeMode: (keepAwakeMode) => set({ keepAwakeMode }),
  setWorkspaces: (workspaces) => set({ workspaces }),
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
