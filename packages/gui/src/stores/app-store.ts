import { create } from 'zustand'

//Types
import type {
  AccountProfile,
  DirEntry,
  KeepAwakeMode,
  Status,
  WorkspaceSummary,
} from '@soromi/protocol'

export type WorkspaceInfo = WorkspaceSummary

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

interface AppState {
  connected: boolean
  keepAwake: boolean
  keepAwakeMode: KeepAwakeMode
  workspaces: WorkspaceInfo[]
  active: string | null
  overlays: Overlay[]
  muted: Record<string, boolean>
  accounts: AccountProfile[]
  notice: string | null
  error: string | null
  /** Directory listings kept per workspace, then keyed by relative path. */
  treeListings: Record<string, Record<string, DirEntry[]>>
  treeExpanded: Record<string, Record<string, boolean>>
  setConnected: (connected: boolean) => void
  setKeepAwake: (keepAwake: boolean) => void
  setKeepAwakeMode: (mode: KeepAwakeMode) => void
  setWorkspaces: (workspaces: WorkspaceInfo[]) => void
  setStatus: (name: string, status: Status) => void
  select: (name: string) => void
  openFile: (workspace: string, path: string) => void
  openCreateSpace: () => void
  openSettings: () => void
  popOverlay: () => void
  closeOverlays: () => void
  setAccounts: (accounts: AccountProfile[]) => void
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
  overlays: [],
  muted: {},
  accounts: [],
  notice: null,
  error: null,
  treeListings: {},
  treeExpanded: {},
  setConnected: (connected) => set({ connected }),
  setKeepAwake: (keepAwake) => set({ keepAwake }),
  setKeepAwakeMode: (keepAwakeMode) => set({ keepAwakeMode }),
  setWorkspaces: (workspaces) =>
    set((state) => {
      const stillActive = state.active !== null && workspaces.some((w) => w.name === state.active)
      if (stillActive) return { workspaces }
      if (workspaces.length === 0) return { workspaces, active: null, overlays: [] }
      return { workspaces, active: workspaces[0].name, overlays: [] }
    }),
  setStatus: (name, status) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.name === name ? { ...w, status } : w)),
    })),
  select: (name) => set({ active: name, error: null, overlays: [] }),
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
  popOverlay: () => set((state) => ({ overlays: state.overlays.slice(0, -1) })),
  closeOverlays: () => set({ overlays: [] }),
  setAccounts: (accounts) => set({ accounts }),
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
