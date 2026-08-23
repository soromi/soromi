/**
 * The desktop shell's platform calls. This is the only module that talks to the native shell, so the
 * screens stay free of host specifics. The Electron shell (`apps/desktop`) exposes a bridge on
 * `window.__SOROMI_ELECTRON__` via its preload; outside it (e.g. the gui running in a plain browser
 * during dev) the calls fall back to the browser or no-op.
 */

/** The Electron shell's native bridge, exposed by its preload via `contextBridge`. */
type ElectronHost = {
  quit: () => void
  pickFolder: (title: string) => Promise<string | null>
  openExternal: (url: string) => void
  revealInFinder: (path: string) => void
  focusWindow: () => Promise<void>
  onNotificationClick: (handler: (workspace: string | null, session: string | null) => void) => void
  showNotification: (
    title: string,
    body: string,
    workspace: string | null,
    session: string | null,
  ) => void
}

const electron: ElectronHost | undefined =
  typeof window !== 'undefined'
    ? (window.__SOROMI_ELECTRON__ as ElectronHost | undefined)
    : undefined

/** Opens a URL in the user's browser, falling back to a new tab in the browser. */
export function openExternal(url: string) {
  if (electron) electron.openExternal(url)
  else window.open(url, '_blank', 'noreferrer')
}

/** Native folder picker; resolves to the chosen path, or null if cancelled or unavailable. */
export async function pickFolder(title: string): Promise<string | null> {
  if (electron) return electron.pickFolder(title)
  return null
}

/** Quits the app (desktop only; a no-op in the browser). */
export function quit() {
  if (electron) electron.quit()
}

/** Shows a path in the OS file manager (Finder). Desktop only. */
export function revealInFinder(path: string) {
  if (electron) electron.revealInFinder(path)
}

/** Copies text to the clipboard. */
export function copyText(text: string) {
  void navigator.clipboard?.writeText(text)
}

/** Brings the app window to the front (the window is hidden, not closed, on close). Desktop only. */
export async function focusWindow() {
  if (electron) await electron.focusWindow()
}

/**
 * Shows a native OS notification with the app identity. Electron only: the daemon routes agent
 * banners to the shell (see the `notify` message) so they carry the Soromi icon and open the app on
 * click. The web has no OS notifications, so it no-ops here.
 */
export function showNotification(
  title: string,
  body: string,
  workspace: string | null = null,
  session: string | null = null,
) {
  if (electron) electron.showNotification(title, body, workspace, session)
}

/**
 * Runs `handler` when an OS notification is clicked, with the workspace/session it was about so the
 * app can open that tab. Desktop only; no-op elsewhere.
 */
export function onNotificationClick(
  handler: (workspace: string | null, session: string | null) => void,
) {
  if (electron) electron.onNotificationClick(handler)
}
