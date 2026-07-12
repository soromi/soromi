import { create } from 'zustand'

//Packages
import type { WorkspaceInfo } from '@soromi/client'

/** Which view the sidebar overlay shows. */
export type SidebarMode = 'files' | 'skills'

/**
 * A view layered over the persistent terminal base, pushed/popped as a stack (mirrors the desktop
 * app's overlay concept). The terminal underneath is never unmounted by navigation.
 */
export type Overlay = { id: string; type: 'workspaces' } | { id: string; type: 'sidebar' }

/**
 * Per-viewport navigation for the mobile shell. Daemon-mirrored data lives in `useClientStore`
 * (shared with desktop); this holds only what the phone UI navigates: the overlay stack over the
 * persistent terminal, plus the active workspace/tab.
 */
interface UiState {
  /** Whether a device is paired. Gates the connect screen. Mock-only until pairing lands. */
  paired: boolean
  active: string | null
  /** The active tab (session id) per workspace. */
  activeSession: Record<string, string>
  /** The overlay stack over the terminal base; the last entry is on top. */
  overlays: Overlay[]
  sidebarMode: SidebarMode
  setPaired: (paired: boolean) => void
  select: (name: string) => void
  selectSession: (workspace: string, session: string) => void
  /** Re-derive the active workspace/tab against a fresh workspace list. */
  reconcile: (workspaces: WorkspaceInfo[]) => void
  openWorkspaces: () => void
  openSidebar: () => void
  popOverlay: () => void
  closeOverlays: () => void
  setSidebarMode: (mode: SidebarMode) => void
}

const newId = () => crypto.randomUUID()

export const useUiStore = create<UiState>()((set) => ({
  paired: false,
  active: null,
  activeSession: {},
  overlays: [],
  sidebarMode: 'files',
  setPaired: (paired) => set({ paired }),
  select: (name) => set({ active: name, overlays: [] }),
  selectSession: (workspace, session) =>
    set((state) => ({ activeSession: { ...state.activeSession, [workspace]: session } })),
  reconcile: (workspaces) =>
    set((state) => {
      const activeSession: Record<string, string> = {}
      for (const w of workspaces) {
        const ids = w.sessions.map((s) => s.id)
        const chosen = state.activeSession[w.name]
        activeSession[w.name] = chosen && ids.includes(chosen) ? chosen : (ids[0] ?? '')
      }
      const stillActive = state.active !== null && workspaces.some((w) => w.name === state.active)
      const active = stillActive ? state.active : (workspaces[0]?.name ?? null)
      return { activeSession, active }
    }),
  openWorkspaces: () =>
    set((state) => {
      if (state.overlays.at(-1)?.type === 'workspaces') return {}
      return { overlays: [...state.overlays, { id: newId(), type: 'workspaces' }] }
    }),
  openSidebar: () =>
    set((state) => {
      if (state.overlays.at(-1)?.type === 'sidebar') return {}
      return { overlays: [...state.overlays, { id: newId(), type: 'sidebar' }] }
    }),
  popOverlay: () => set((state) => ({ overlays: state.overlays.slice(0, -1) })),
  closeOverlays: () => set({ overlays: [] }),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
}))
