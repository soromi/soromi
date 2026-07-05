import { create } from 'zustand'

//Types
import type {
  AccountProfile,
  DirEntry,
  KeepAwakeMode,
  SessionSummary,
  Status,
  WorkspaceSummary,
} from '@soromi/protocol'

export type WorkspaceInfo = WorkspaceSummary

/** The workspace's rail status: the most attention-worthy of its sessions. */
function aggregateStatus(sessions: SessionSummary[]): Status {
  const has = (status: Status) => sessions.some((s) => s.status === status)
  if (has('thinking')) return 'thinking'
  if (has('waiting-input')) return 'waiting-input'
  if (has('blocked')) return 'blocked'
  if (has('done')) return 'done'
  return 'idle'
}

/** Ensures each workspace keeps a valid active session, defaulting to its first tab. */
function reconcileActiveSession(
  workspaces: WorkspaceInfo[],
  current: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const w of workspaces) {
    const ids = w.sessions.map((s) => s.id)
    const chosen = current[w.name]
    next[w.name] = chosen && ids.includes(chosen) ? chosen : (ids[0] ?? '')
  }
  return next
}

export interface FileContent {
  content: string
  truncated: boolean
  binary: boolean
}

/**
 * A view layered on top of the persistent workspace base. Overlays are pushed/popped as a
 * stack; the terminal underneath is never unmounted, so it keeps running.
 */
export type Overlay =
  | { id: string; type: 'file'; workspace: string; path: string; content: FileContent | null }
  | { id: string; type: 'create-space' }
  | { id: string; type: 'settings' }
  | { id: string; type: 'workspace-settings'; workspace: string }

/**
 * How much an overlay covers. `full` covers the whole shell (rail + sidebar + content) for
 * app-wide screens; `content` covers only the workspace content, keeping the rail/sidebar
 * visible so it reads as workspace-scoped.
 */
export function overlayScope(overlay: Overlay): 'full' | 'content' {
  return overlay.type === 'settings' || overlay.type === 'create-space' ? 'full' : 'content'
}

interface AppState {
  connected: boolean
  keepAwake: boolean
  keepAwakeMode: KeepAwakeMode
  workspaces: WorkspaceInfo[]
  active: string | null
  /** The active tab (session id) per workspace. */
  activeSession: Record<string, string>
  overlays: Overlay[]
  muted: Record<string, boolean>
  accounts: AccountProfile[]
  /** Whether a provider's config dir looks logged in, keyed by `provider::configDir`. */
  providerStatus: Record<string, boolean>
  notice: string | null
  error: string | null
  /** Directory listings kept per workspace, then keyed by relative path. */
  treeListings: Record<string, Record<string, DirEntry[]>>
  treeExpanded: Record<string, Record<string, boolean>>
  setConnected: (connected: boolean) => void
  setKeepAwake: (keepAwake: boolean) => void
  setKeepAwakeMode: (mode: KeepAwakeMode) => void
  setWorkspaces: (workspaces: WorkspaceInfo[]) => void
  setSessionStatus: (session: string, status: Status) => void
  select: (name: string) => void
  selectSession: (workspace: string, session: string) => void
  addSession: (workspace: string, session: SessionSummary) => void
  openFile: (workspace: string, path: string) => void
  openCreateSpace: () => void
  openSettings: () => void
  openWorkspaceSettings: (workspace: string) => void
  popOverlay: () => void
  closeOverlays: () => void
  setAccounts: (accounts: AccountProfile[]) => void
  setProviderStatus: (provider: string, configDir: string, loggedIn: boolean) => void
  setFileContent: (workspace: string, path: string, content: FileContent) => void
  setMuted: (name: string, muted: boolean) => void
  setNotice: (notice: string | null) => void
  setError: (error: string | null) => void
  setListing: (workspace: string, path: string, entries: DirEntry[]) => void
  toggleTreeNode: (workspace: string, path: string) => void
}

export const useAppStore = create<AppState>()((set) => ({
  connected: false,
  keepAwake: false,
  keepAwakeMode: 'off',
  workspaces: [],
  active: null,
  activeSession: {},
  overlays: [],
  muted: {},
  accounts: [],
  providerStatus: {},
  notice: null,
  error: null,
  treeListings: {},
  treeExpanded: {},
  setConnected: (connected) => set({ connected }),
  setKeepAwake: (keepAwake) => set({ keepAwake }),
  setKeepAwakeMode: (keepAwakeMode) => set({ keepAwakeMode }),
  setWorkspaces: (workspaces) =>
    set((state) => {
      const activeSession = reconcileActiveSession(workspaces, state.activeSession)
      const stillActive = state.active !== null && workspaces.some((w) => w.name === state.active)
      if (stillActive) return { workspaces, activeSession }
      if (workspaces.length === 0) return { workspaces, activeSession, active: null, overlays: [] }
      return { workspaces, activeSession, active: workspaces[0].name, overlays: [] }
    }),
  setSessionStatus: (session, status) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) => {
        if (!w.sessions.some((s) => s.id === session)) return w
        const sessions = w.sessions.map((s) => (s.id === session ? { ...s, status } : s))
        return { ...w, sessions, status: aggregateStatus(sessions) }
      }),
    })),
  select: (name) => set({ active: name, error: null, overlays: [] }),
  selectSession: (workspace, session) =>
    set((state) => ({ activeSession: { ...state.activeSession, [workspace]: session } })),
  addSession: (workspace, session) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.name === workspace && !w.sessions.some((s) => s.id === session.id)
          ? { ...w, sessions: [...w.sessions, session] }
          : w,
      ),
      activeSession: { ...state.activeSession, [workspace]: session.id },
    })),
  openFile: (workspace, path) =>
    set((state) => {
      const entry: Overlay = {
        id: crypto.randomUUID(),
        type: 'file',
        workspace,
        path,
        content: null,
      }
      const top = state.overlays.at(-1)
      const overlays =
        top?.type === 'file' ? [...state.overlays.slice(0, -1), entry] : [...state.overlays, entry]
      return { overlays }
    }),
  openCreateSpace: () =>
    set((state) => {
      if (state.active === null) return {}
      if (state.overlays.at(-1)?.type === 'create-space') return {}
      const entry: Overlay = { id: crypto.randomUUID(), type: 'create-space' }
      return { overlays: [...state.overlays, entry], error: null }
    }),
  openSettings: () =>
    set((state) => {
      if (state.overlays.at(-1)?.type === 'settings') return {}
      return { overlays: [...state.overlays, { id: crypto.randomUUID(), type: 'settings' }] }
    }),
  openWorkspaceSettings: (workspace) =>
    set((state) => {
      const top = state.overlays.at(-1)
      if (top?.type === 'workspace-settings' && top.workspace === workspace) return {}
      return {
        overlays: [
          ...state.overlays,
          { id: crypto.randomUUID(), type: 'workspace-settings', workspace },
        ],
      }
    }),
  popOverlay: () => set((state) => ({ overlays: state.overlays.slice(0, -1) })),
  closeOverlays: () => set({ overlays: [] }),
  setAccounts: (accounts) => set({ accounts }),
  setProviderStatus: (provider, configDir, loggedIn) =>
    set((state) => ({
      providerStatus: { ...state.providerStatus, [`${provider}::${configDir}`]: loggedIn },
    })),
  setFileContent: (workspace, path, content) =>
    set((state) => ({
      overlays: state.overlays.map((o) =>
        o.type === 'file' && o.workspace === workspace && o.path === path ? { ...o, content } : o,
      ),
    })),
  setMuted: (name, muted) => set((state) => ({ muted: { ...state.muted, [name]: muted } })),
  setNotice: (notice) => set({ notice }),
  setError: (error) => set({ error }),
  setListing: (workspace, path, entries) =>
    set((state) => ({
      treeListings: {
        ...state.treeListings,
        [workspace]: { ...state.treeListings[workspace], [path]: entries },
      },
    })),
  toggleTreeNode: (workspace, path) =>
    set((state) => {
      const current = state.treeExpanded[workspace] ?? {}
      return {
        treeExpanded: {
          ...state.treeExpanded,
          [workspace]: { ...current, [path]: !current[path] },
        },
      }
    }),
}))
