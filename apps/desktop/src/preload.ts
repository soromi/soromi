// Preload for the Electron shell. Runs before any page script with access to Node + Electron, and
// exposes a minimal, typed bridge into the renderer's isolated world via `contextBridge`:
//   - `window.__SOROMI_DAEMON_URL__` / `__SOROMI_VERSION__` — read by `packages/gui/src/config`
//     the daemon endpoint + app version the renderer reads before any page script runs.
//   - `window.__SOROMI_ELECTRON__` — the native platform calls `packages/gui/src/lib/host.ts` routes
//     to when running under Electron. Each maps to an IPC handler in `main.ts`.

import { contextBridge, ipcRenderer } from 'electron'

/** Reads a `--name=value` argument passed via the window's `webPreferences.additionalArguments`. */
function arg(name: string): string {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : ''
}

contextBridge.exposeInMainWorld('__SOROMI_DAEMON_URL__', arg('soromi-daemon-url'))
contextBridge.exposeInMainWorld('__SOROMI_VERSION__', arg('soromi-version'))

contextBridge.exposeInMainWorld('__SOROMI_ELECTRON__', {
  quit: (): void => {
    void ipcRenderer.invoke('quit')
  },
  pickFolder: (title: string): Promise<string | null> => ipcRenderer.invoke('pick-folder', title),
  openExternal: (url: string): void => {
    void ipcRenderer.invoke('open-external', url)
  },
  revealInFinder: (target: string): void => {
    void ipcRenderer.invoke('reveal', target)
  },
  focusWindow: (): Promise<void> => ipcRenderer.invoke('focus-window'),
  showNotification: (
    title: string,
    body: string,
    workspace: string | null,
    session: string | null,
  ): void => {
    void ipcRenderer.invoke('notify', { title, body, workspace, session })
  },
  onNotificationClick: (
    handler: (workspace: string | null, session: string | null) => void,
  ): void => {
    ipcRenderer.on('notification-click', (_event, workspace, session) =>
      handler(workspace, session),
    )
  },
})
