import { create } from 'zustand'

//Packages
import type { WorkspaceInfo } from '@soromi/client'
import type { DirEntry } from '@soromi/protocol'

/** The bottom-bar section the phone is showing. The terminal is the base; files/skills layer over it. */
export type MobileTab = 'terminal' | 'files' | 'skills'

/** Which panel the wide layout's sidebar shows (the phone uses `tab` instead). */
export type SidebarMode = 'files' | 'skills'

/** A bottom sheet (Mantine Drawer) raised over the shell. Only one is open at a time. */
export type Sheet = 'workspaces' | 'session-menu'

/**
 * A full-page overlay layered over the terminal base, pushed/popped as a stack (the same concept as
 * the desktop app's overlays). Esc pops the top; the terminal underneath is never unmounted. Today
 * the only kind is a read-only file view; new kinds join this union.
 */
export interface FileOverlay {
  id: string
  type: 'file'
  workspace: string
  path: string
  content: string | null
  truncated: boolean
  binary: boolean
}

export type Overlay = FileOverlay

/** Bounds for the session font-size stepper. */
const FONT_MIN = 10
const FONT_MAX = 18

/**
 * Per-viewport navigation for the mobile shell. Daemon-mirrored data lives in `useClientStore`
 * (shared with desktop); this holds only what the phone UI navigates: the active workspace/tab, the
 * bottom-bar section, per-session view settings, and which bottom sheet is open.
 */
interface UiState {
  /** Whether a device is paired. Gates the connect screen. Mock-only until pairing lands. */
  paired: boolean
  active: string | null
  /** The active tab (session id) per workspace. */
  activeSession: Record<string, string>
  /** Which bottom-bar section is showing (mobile layout). */
  tab: MobileTab
  /** Which sidebar panel is showing (wide layout). */
  sidebarMode: SidebarMode
  /** Wide sidebar width in px (draggable). */
  sidebarWidth: number
  /** Session view settings: the touch key row and terminal text size. */
  keyboardVisible: boolean
  fontSize: number
  /** Lazy file-tree state per workspace: cached listings and which directories are open. */
  treeListings: Record<string, Record<string, DirEntry[]>>
  treeExpanded: Record<string, Record<string, boolean>>
  /** The open bottom sheet, or `null` when none is raised. */
  sheet: Sheet | null
  /** The full-page overlay stack over the terminal base; the last entry is on top. */
  overlays: Overlay[]
  setPaired: (paired: boolean) => void
  select: (name: string) => void
  selectSession: (workspace: string, session: string) => void
  /** Re-derive the active workspace/tab against a fresh workspace list. */
  reconcile: (workspaces: WorkspaceInfo[]) => void
  setTab: (tab: MobileTab) => void
  setSidebarMode: (mode: SidebarMode) => void
  setSidebarWidth: (width: number) => void
  toggleKeyboard: () => void
  setFontSize: (size: number) => void
  setListing: (workspace: string, path: string, entries: DirEntry[]) => void
  toggleTreeNode: (workspace: string, path: string) => void
  openSheet: (sheet: Sheet) => void
  closeSheet: () => void
  openFile: (workspace: string, path: string) => void
  setFileContent: (path: string, content: string, truncated: boolean, binary: boolean) => void
  popOverlay: () => void
  closeOverlays: () => void
}

const newId = () => crypto.randomUUID()

const clampFont = (size: number) => Math.max(FONT_MIN, Math.min(FONT_MAX, size))

export const useUiStore = create<UiState>()((set) => ({
  paired: false,
  active: null,
  activeSession: {},
  tab: 'terminal',
  sidebarMode: 'files',
  sidebarWidth: 250,
  keyboardVisible: true,
  fontSize: 13,
  treeListings: {},
  treeExpanded: {},
  sheet: null,
  overlays: [],
  setPaired: (paired) => set({ paired }),
  select: (name) => set({ active: name, tab: 'terminal', sheet: null, overlays: [] }),
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
  setTab: (tab) => set({ tab, overlays: [] }),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(190, Math.min(460, width)) }),
  toggleKeyboard: () => set((state) => ({ keyboardVisible: !state.keyboardVisible })),
  setFontSize: (size) => set({ fontSize: clampFont(size) }),
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
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  openFile: (workspace, path) =>
    set((state) => ({
      overlays: [
        ...state.overlays,
        {
          id: newId(),
          type: 'file',
          workspace,
          path,
          content: null,
          truncated: false,
          binary: false,
        },
      ],
    })),
  setFileContent: (path, content, truncated, binary) =>
    set((state) => ({
      // Fill in the content of the matching file overlay once the daemon replies.
      overlays: state.overlays.map((overlay) =>
        overlay.type === 'file' && overlay.path === path && overlay.content === null
          ? { ...overlay, content, truncated, binary }
          : overlay,
      ),
    })),
  popOverlay: () => set((state) => ({ overlays: state.overlays.slice(0, -1) })),
  closeOverlays: () => set({ overlays: [] }),
}))
