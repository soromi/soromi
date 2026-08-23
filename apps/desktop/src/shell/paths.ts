// Filesystem locations and environment the shell resolves once. Vite bundles the whole main process
// into `<app>/.vite/build/main.js`, so `__dirname` is that build dir regardless of source layout —
// the repo root is four levels up in dev, and the app dir (holding `icons/`) is two up.

import * as path from 'node:path'
import { app } from 'electron'

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..')

/** The app icons directory and the default icon. */
export const ICON_DIR = path.resolve(__dirname, '..', '..', 'icons')
export const APP_ICON = path.join(ICON_DIR, 'icon.png')

/** The built frontend: bundled into Resources/dist when packaged, read from the gui package in dev. */
export const RENDERER_DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(REPO_ROOT, 'packages', 'gui', 'dist')

/** In dev (`SOROMI_DEV=1`), load the gui dev server for hot-reload instead of the built bundle. */
export const IS_DEV = !!process.env.SOROMI_DEV
export const DEV_SERVER_URL = process.env.SOROMI_DEV_URL || 'http://localhost:1420'

/** The standalone daemon binary: a bundled resource when packaged, else the cargo build output. */
export function daemonBinary(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'soromi-daemon')
  const profile = process.env.SOROMI_DAEMON_PROFILE || 'debug'
  return path.join(REPO_ROOT, 'target', profile, 'soromi-daemon')
}
