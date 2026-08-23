// The single main window and its chrome. Owns the one BrowserWindow instance and its behaviors:
// unified macOS title bar, hide-on-close (the daemon keeps running), and the drag-region mapping the
// shared frontend expects.

import * as path from 'node:path'
import { app, BrowserWindow, nativeImage } from 'electron'
import { isQuitting } from './lifecycle'
import { APP_ICON } from './paths'
import { loadRenderer } from './serve'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** Shows and focuses the main window (it hides rather than closes, so it's reused). */
export function showMainWindow(): void {
  if (!mainWindow) return
  mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

/** Creates the main window, wires its lifecycle, and loads the renderer pointed at the daemon. */
export function createMainWindow(daemonPort: number): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: '#09090a',
    // Unified title bar: traffic lights overlay our own top bar, native title hidden. The frontend
    // already insets its top bar on macOS (isMac -> pl-[76px]).
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 13 },
    // The window icon is used on Windows/Linux (macOS uses the bundle's .icns). In dev the bundle
    // doesn't exist, so point at the source png.
    ...(app.isPackaged ? {} : { icon: APP_ICON }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Passed to the preload via process.argv so it can expose them before any page script runs.
      additionalArguments: [
        `--soromi-daemon-url=ws://localhost:${daemonPort}`,
        `--soromi-version=${app.getVersion()}`,
      ],
    },
  })

  // Close hides the window (the daemon and its agents stay alive); the dock icon reopens it. Real
  // quit (Cmd+Q) marks `quitting` first, so this lets it through.
  mainWindow.on('close', (event) => {
    if (!isQuitting()) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // A file dropped outside the composer's dropzone would otherwise navigate the window to that file.
  // Block navigations — the SPA never navigates; external links open via the shell.
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  // The frontend marks draggable regions with `data-drag-region`; under Electron dragging is a
  // CSS concern, so map that attribute to the app-region and keep interactive children clickable.
  mainWindow.webContents.on('did-finish-load', () => {
    void mainWindow?.webContents.insertCSS(
      `[data-drag-region]{-webkit-app-region:drag}
       [data-drag-region] button,[data-drag-region] a,[data-drag-region] input,
       [data-drag-region] textarea,[data-drag-region] select{-webkit-app-region:no-drag}`,
    )
  })

  loadRenderer(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  return mainWindow
}

/** In dev the dock shows Electron's icon (the bundle doesn't exist); set ours. macOS only. */
export function setDevDockIcon(): void {
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(APP_ICON))
  }
}
