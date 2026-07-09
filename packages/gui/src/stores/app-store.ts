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

/**
 * How much an overlay covers. `full` covers the whole shell (rail + sidebar + content) for
 * app-wide screens; `content` covers only the workspace content, keeping the rail/sidebar
 * visible so it reads as workspace-scoped.
 */
export function overlayScope(overlay: Overlay): 'full' | 'content' {
  return overlay.type === 'settings' || overlay.type === 'create-space' ? 'full' : 'content'
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
  notice: string | null
  error: string | null
  select: (name: string) => void
  selectSession: (workspace: string, session: string) => void
  /** Re-derive active workspace/tab against a fresh workspace list from the daemon. */
  reconcile: (workspaces: WorkspaceInfo[]) => void
  openFile: (workspace: string, path: string) => void
  openCreateSpace: () => void
  openSettings: () => void
  openWorkspaceSettings: (workspace: string) => void
  popOverlay: () => void
  closeOverlays: () => void
  setFileContent: (workspace: string, path: string, content: FileContent) => void
  setListing: (workspace: string, path: string, entries: DirEntry[]) => void
  /** Drops a workspace's cached tree, so it re-fetches (e.g. after its folders changed). */
  resetTree: (workspace: string) => void
  toggleTreeNode: (workspace: string, path: string) => void
  setSidebarMode: (mode: SidebarMode) => void
  setNotice: (notice: string | null) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<UiState>()((set) => ({
  active: null,
  activeSession: {},
  overlays: [],
  treeListings: {},
  treeExpanded: {},
  sidebarMode: 'files',
  notice: null,
  error: null,
  select: (name) => set({ active: name, error: null, overlays: [] }),
  selectSession: (workspace, session) =>
    set((state) => ({ activeSession: { ...state.activeSession, [workspace]: session } })),
  reconcile: (workspaces) =>
    set((state) => {
      const activeSession = reconcileActiveSession(workspaces, state.activeSession)
      const stillActive = state.active !== null && workspaces.some((w) => w.name === state.active)
      if (stillActive) return { activeSession }
      if (workspaces.length === 0) return { activeSession, active: null, overlays: [] }
      return { activeSession, active: workspaces[0].name, overlays: [] }
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
  setNotice: (notice) => set({ notice }),
  setError: (error) => set({ error }),
}))
