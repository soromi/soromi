declare global {
  interface Window {
    /** Injected by the Tauri shell with the in-process daemon's actual endpoint. */
    __SOROMI_DAEMON_URL__?: string
  }
}

/**
 * The daemon's local WebSocket endpoint the viewport connects to. The desktop shell injects
 * the real URL (its daemon binds an ephemeral port); the fallback is the fixed dev port used
 * when running the GUI standalone against `pnpm daemon`.
 */
export const DAEMON_URL =
  (typeof window !== 'undefined' && window.__SOROMI_DAEMON_URL__) || 'ws://localhost:8317'
