// The single main window and its chrome. Owns the one BrowserWindow instance and its behaviors:
// unified macOS title bar, hide-on-close (the daemon keeps running), and the drag-region mapping the
// shared frontend expects.

import * as path from 'node:path'
import { app, BrowserWindow, nativeImage, nativeTheme, shell } from 'electron'
import { backgroundFor, loadAppearance } from './appearance'
import { type DaemonLink, daemonUrl } from './daemon'
import { isQuitting } from './lifecycle'
import { APP_ICON } from './paths'
import { loadRenderer } from './serve'
import { loadWindowState, trackWindowState } from './window-state'

let mainWindow: BrowserWindow | null = null

/** What a link may hand to the system: web pages and mail. Nothing that opens a local file or runs
 * an app. */
const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/** Opens a link in the user's default browser (or mail app), if it is one that belongs there. */
function openInBrowser(url: string): void {
  try {
    if (EXTERNAL_SCHEMES.has(new URL(url).protocol)) void shell.openExternal(url)
  } catch {
    // Not a URL at all: nothing to open.
  }
}

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
export function createMainWindow(daemon: DaemonLink): BrowserWindow {
  // Opens as it was left; the first time, filling the screen (from a centered 1200x800, which is
  // what un-maximizing it then returns to).
  const state = loadWindowState()
  // In the appearance last chosen, so a light app does not open on a dark window.
  const appearance = loadAppearance()
  nativeTheme.themeSource = appearance
  mainWindow = new BrowserWindow({
    ...(state.bounds ?? { width: 1200, height: 800 }),
    show: false,
    backgroundColor: backgroundFor(appearance),
    // Unified title bar: traffic lights overlay our own top bar, native title hidden. The frontend
    // already insets its top bar on macOS (isMac -> pl-[76px]).
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 13 },
    // Elsewhere the app menu is a bar across the top of the window, which the app's own top bar
    // already does the work of: it stays out of the way until Alt is pressed, as Linux apps do.
    autoHideMenuBar: process.platform !== 'darwin',
    // The window icon is used on Windows/Linux, where nothing else gives the window one; macOS
    // uses the bundle's .icns (and, in dev, where there is no bundle, the source png).
    ...(process.platform !== 'darwin' || !app.isPackaged ? { icon: APP_ICON } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Passed to the preload via process.argv so it can expose them before any page script runs.
      additionalArguments: [
        `--soromi-daemon-url=${daemonUrl(daemon)}`,
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

  // A link the page opens in a new window (a chat message's links do) goes to the user's default
  // browser: the app never opens windows of its own for the web.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url)
    return { action: 'deny' }
  })

  // The SPA never navigates, so every navigation is blocked: a file dropped outside the composer's
  // dropzone would otherwise replace the app with that file. A link that would have navigated the
  // window opens in the browser instead.
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
    openInBrowser(event.url)
  })

  // The frontend marks draggable regions with `data-drag-region`; under Electron dragging is a
  // CSS concern, so map that attribute to the app-region and keep interactive children clickable.
  mainWindow.webContents.on('did-finish-load', () => {
    void mainWindow?.webContents.insertCSS(
      `[data-drag-region]{-webkit-app-region:drag}
       [data-drag-region] button,[data-drag-region] a,[data-drag-region] input,
       [data-drag-region] textarea,[data-drag-region] select{-webkit-app-region:no-drag}`,
    )
  })

  trackWindowState(mainWindow)
  loadRenderer(mainWindow)
  mainWindow.once('ready-to-show', () => {
    if (state.maximized) mainWindow?.maximize()
    mainWindow?.show()
  })
  return mainWindow
}

/** In dev the dock shows Electron's icon (the bundle doesn't exist); set ours. macOS only. */
export function setDevDockIcon(): void {
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(APP_ICON))
  }
}
