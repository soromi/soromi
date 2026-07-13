import { create } from 'zustand'

//Packages
import type { WorkspaceInfo } from '@soromi/client'

//Types
import type { DirEntry } from '@soromi/protocol'

/** Which view the contextual sidebar shows. */
export type SidebarMode = 'files' | 'skills'

export interface FileContent {
  content: string
  truncated: boolean
  binary: boolean
}

/** The sidebar's resizable width, clamped and remembered across sessions. */
const SIDEBAR_WIDTH_KEY = 'soromi.sidebarWidth'
const DEFAULT_SIDEBAR_WIDTH = 230
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 640
const clampSidebarWidth = (width: number) =>
  Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)))
const readSidebarWidth = (): number => {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return stored ? clampSidebarWidth(stored) : DEFAULT_SIDEBAR_WIDTH
  } catch {
    return DEFAULT_SIDEBAR_WIDTH
  }
}

/** The workspace open when the app last closed, restored on launch (falls back to the first). */
const ACTIVE_WORKSPACE_KEY = 'soromi.activeWorkspace'
const readActiveWorkspace = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY)
  } catch {
    return null
  }
}
const writeActiveWorkspace = (name: string | null): void => {
  try {
    if (name === null) localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
    else localStorage.setItem(ACTIVE_WORKSPACE_KEY, name)
  } catch {}
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

/**
 * A view layered on top of the persistent workspace base. Overlays are pushed/popped as a
 * stack; the terminal underneath is never unmounted, so it keeps running.
 */
export type Overlay =
  | { id: string; type: 'file'; workspace: string; path: string; content: FileContent | null }
  | { id: string; type: 'create-space' }
  | { id: string; type: 'settings' }
  | { id: string; type: 'workspace-settings'; workspace: string }
  | { id: string; type: 'connect-phone' }

/**
 * How much an overlay covers. `full` covers the whole shell (rail + sidebar + content) for
 * app-wide screens; `content` covers only the workspace content, keeping the rail/sidebar
 * visible so it reads as workspace-scoped.
 */
export function overlayScope(overlay: Overlay): 'full' | 'content' {
  return overlay.type === 'settings' ||
    overlay.type === 'create-space' ||
    overlay.type === 'connect-phone' ||
    overlay.type === 'workspace-settings'
    ? 'full'
    : 'content'
}

/**
 * Per-viewport navigation state: which workspace/tab is active, the overlay stack, the file
 * tree, and the transient banners. Daemon-mirrored data lives in `useClientStore`; this store
 * is the desktop shell's own, so a different shell (e.g. web) can navigate its own way.
 */
interface UiState {
  active: string | null
  /** The active tab (session id) per workspace. */
  activeSession: Record<string, string>
  overlays: Overlay[]
  /** Directory listings kept per workspace, then keyed by relative path. */
  treeListings: Record<string, Record<string, DirEntry[]>>
  treeExpanded: Record<string, Record<string, boolean>>
  sidebarMode: SidebarMode
  /** The Files/Skills sidebar width in px (draggable, persisted). */
  sidebarWidth: number
  /** Workspaces that finished while you weren't looking at them (per-viewer "needs review"). */
  needsReview: Record<string, boolean>
  /** Last-seen aggregate status per workspace, to detect the transition into "finished". */
  lastStatus: Record<string, string>
  notice: string | null
  error: string | null
  select: (name: string) => void
  /** Re-derive `needsReview` from fresh statuses: a workspace that just became `done` while it is
   * not the active one needs review; opening it (via `select`) clears it. */
  applyStatuses: (workspaces: WorkspaceInfo[]) => void
  selectSession: (workspace: string, session: string) => void
  /** Re-derive active workspace/tab against a fresh workspace list from the daemon. */
  reconcile: (workspaces: WorkspaceInfo[]) => void
  openFile: (workspace: string, path: string) => void
  openCreateSpace: () => void
  openSettings: () => void
  openWorkspaceSettings: (workspace: string) => void
  openConnectPhone: () => void
  popOverlay: () => void
  closeOverlays: () => void
  setFileContent: (workspace: string, path: string, content: FileContent) => void
  setListing: (workspace: string, path: string, entries: DirEntry[]) => void
  /** Drops a workspace's cached tree, so it re-fetches (e.g. after its folders changed). */
  resetTree: (workspace: string) => void
  toggleTreeNode: (workspace: string, path: string) => void
  setSidebarMode: (mode: SidebarMode) => void
  setSidebarWidth: (width: number) => void
  setNotice: (notice: string | null) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<UiState>()((set) => ({
  active: readActiveWorkspace(),
  activeSession: {},
  overlays: [],
  treeListings: {},
  treeExpanded: {},
  sidebarMode: 'files',
  sidebarWidth: readSidebarWidth(),
  needsReview: {},
  lastStatus: {},
  notice: null,
  error: null,
  select: (name) =>
    set((state) => {
      writeActiveWorkspace(name)
      const { [name]: _seen, ...needsReview } = state.needsReview
      return { active: name, error: null, overlays: [], needsReview }
    }),
  applyStatuses: (workspaces) =>
    set((state) => {
      const needsReview = { ...state.needsReview }
      const lastStatus: Record<string, string> = {}

      for (const workspace of workspaces) {
        const became = workspace.status === 'done' && state.lastStatus[workspace.name] !== 'done'
        if (became && workspace.name !== state.active) needsReview[workspace.name] = true
        if (workspace.status !== 'done') delete needsReview[workspace.name]
        lastStatus[workspace.name] = workspace.status
      }

      return { needsReview, lastStatus }
    }),
  selectSession: (workspace, session) =>
    set((state) => ({ activeSession: { ...state.activeSession, [workspace]: session } })),
  reconcile: (workspaces) =>
    set((state) => {
      const activeSession = reconcileActiveSession(workspaces, state.activeSession)
      // Keep the restored/selected workspace if it still exists; otherwise fall back to the first.
      const stillActive = state.active !== null && workspaces.some((w) => w.name === state.active)
      if (stillActive) return { activeSession }

      const next = workspaces[0]?.name ?? null
      writeActiveWorkspace(next)

      return { activeSession, active: next, overlays: [] }
    }),
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
  openConnectPhone: () =>
    set((state) => {
      if (state.overlays.at(-1)?.type === 'connect-phone') return {}
      return { overlays: [...state.overlays, { id: crypto.randomUUID(), type: 'connect-phone' }] }
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
  setFileContent: (workspace, path, content) =>
    set((state) => ({
      overlays: state.overlays.map((o) =>
        o.type === 'file' && o.workspace === workspace && o.path === path ? { ...o, content } : o,
      ),
    })),
  setListing: (workspace, path, entries) =>
    set((state) => ({
      treeListings: {
        ...state.treeListings,
        [workspace]: { ...state.treeListings[workspace], [path]: entries },
      },
    })),
  resetTree: (workspace) =>
    set((state) => {
      const { [workspace]: _l, ...treeListings } = state.treeListings
      const { [workspace]: _e, ...treeExpanded } = state.treeExpanded
      return { treeListings, treeExpanded }
    }),
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
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  setSidebarWidth: (width) => {
    const sidebarWidth = clampSidebarWidth(width)
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
    } catch {}
    set({ sidebarWidth })
  },
  setNotice: (notice) => set({ notice }),
  setError: (error) => set({ error }),
}))
