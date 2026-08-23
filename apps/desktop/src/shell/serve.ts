// Serves the built frontend to the window. The SPA uses absolute asset paths (`/assets/...`), so
// instead of file:// it's served over a custom `app://` origin, with no changes to the shared gui
// build. In dev it loads the gui dev server for hot-reload.

import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { type BrowserWindow, net, protocol } from 'electron'
import { DEV_SERVER_URL, IS_DEV, RENDERER_DIST } from './paths'

/** Registers `app://` as a privileged (standard, secure) scheme. Must run before the app is ready. */
export function registerRendererScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

/** Wires `app://bundle/<path>` to files under the built frontend. Call once the app is ready. */
export function serveRenderer(): void {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const rel = pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '')
    return net.fetch(pathToFileURL(path.join(RENDERER_DIST, rel)).toString())
  })
}

/** Loads the renderer into `window`: the gui dev server in dev, else the served bundle. */
export function loadRenderer(window: BrowserWindow): void {
  void (IS_DEV ? window.loadURL(DEV_SERVER_URL) : window.loadURL('app://bundle/index.html'))
}
