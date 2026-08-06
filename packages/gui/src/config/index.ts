declare global {
  interface Window {
    /** Injected by the Electron shell's preload with the daemon's actual endpoint. */
    __SOROMI_DAEMON_URL__?: string
    /** Injected by the Electron shell's preload with the app's version. */
    __SOROMI_VERSION__?: string
    /** Exposed by the Electron shell's preload: the native platform calls (see `lib/host.ts`). */
    __SOROMI_ELECTRON__?: unknown
  }
}

/**
 * The daemon's local WebSocket endpoint the viewport connects to. The desktop shell injects
 * the real URL (its daemon binds an ephemeral port); the fallback is the fixed dev port used
 * when running the GUI standalone against `pnpm daemon`.
 */
export const DAEMON_URL =
  (typeof window !== 'undefined' && window.__SOROMI_DAEMON_URL__) || 'ws://localhost:8317'

/** True when running inside the Electron desktop shell (native dialogs, notifications, etc.). */
export const isElectron = typeof window !== 'undefined' && '__SOROMI_ELECTRON__' in window

/** True in the native desktop shell — gates UI that needs OS access (Finder, folder picker). */
export const isDesktop = isElectron

/** The app version, injected by the shell. Falls back to a dev placeholder when standalone. */
export const APP_VERSION = (typeof window !== 'undefined' && window.__SOROMI_VERSION__) || '0.0.0'

/** The project's public repository. Backs the "Help & docs" menu item. */
export const REPO_URL = 'https://github.com/soromi/soromi'
