// The Soromi desktop app (Electron). The main process is Node, so it can't run the Rust daemon
// in-process; instead it spawns the standalone `soromi-daemon` binary as a child, hands its
// WebSocket URL to the renderer, and owns its lifecycle. The renderer is the shared `packages/gui`
// build, served over `app://`.
//
// This file is just the wiring; each concern lives in its own module under `shell/`.

import { app } from 'electron'
import started from 'electron-squirrel-startup'
import { startDaemon, stopDaemon } from './shell/daemon'
import { registerIpcHandlers } from './shell/ipc'
import { markQuitting } from './shell/lifecycle'
import { registerRendererScheme, serveRenderer } from './shell/serve'
import { ensureSingleInstance } from './shell/single-instance'
import { createMainWindow, getMainWindow, setDevDockIcon, showMainWindow } from './shell/window'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit()
}

// The app identity used by the menu and native notifications (else they read "Electron" in dev).
app.setName('Soromi')

const isPrimary = ensureSingleInstance()

// Must run before the app is ready.
registerRendererScheme()
registerIpcHandlers()

app.whenReady().then(async () => {
  if (!isPrimary) return

  setDevDockIcon()
  serveRenderer()

  const daemonPort = await startDaemon()
  createMainWindow(daemonPort)

  // macOS: clicking the dock icon reopens/focuses the hidden window.
  app.on('activate', () => {
    if (getMainWindow()) showMainWindow()
    else createMainWindow(daemonPort)
  })
})

// Keep running when all windows close (the window only hides); quit is explicit via Cmd+Q / menu.
app.on('window-all-closed', () => {})
app.on('before-quit', () => markQuitting())
app.on('will-quit', () => stopDaemon())
