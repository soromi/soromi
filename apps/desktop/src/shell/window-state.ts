// Where the main window sits and how big it is, kept across launches. The first launch fills the
// screen (maximized, not full screen); after that the window opens as it was left, as long as the
// display it was on is still attached. Kept in the app's user-data folder.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { app, type BrowserWindow, type Rectangle, screen } from 'electron'

export interface WindowState {
  /** The window's size and place when not maximized: what un-maximizing returns it to. */
  bounds: Rectangle | null
  maximized: boolean
}

const STATE_FILE = 'window-state.json'
/** Moving or resizing fires many times a second; the place is written once it settles. */
const SAVE_DELAY_MS = 500
/** How much of the window's top edge must be on a display for it to be grabbed and moved. */
const REACHABLE_PX = 80

const statePath = (): string => path.join(app.getPath('userData'), STATE_FILE)

const isRectangle = (value: unknown): value is Rectangle => {
  const { x, y, width, height } = (value ?? {}) as Partial<Rectangle>
  return [x, y, width, height].every(Number.isFinite)
}

/** Whether the window's top edge would land on a display, where it can be reached and dragged. */
function isReachable(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlap =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x)
    return (
      overlap >= REACHABLE_PX &&
      bounds.y >= workArea.y &&
      bounds.y <= workArea.y + workArea.height - REACHABLE_PX
    )
  })
}

/** The window as it was last left, or maximized when there is none (or it was left off-screen). */
export function loadWindowState(): WindowState {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    if (!isRectangle(saved.bounds) || !isReachable(saved.bounds)) throw new Error('unusable')
    return { bounds: saved.bounds, maximized: saved.maximized === true }
  } catch {
    return { bounds: null, maximized: true }
  }
}

/** Writes the window's place down as it changes, and once more when it closes (or hides). */
export function trackWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined

  const save = () => {
    clearTimeout(timer)
    if (window.isDestroyed() || window.isMinimized()) return
    const state: WindowState = {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized() || window.isFullScreen(),
    }
    try {
      fs.writeFileSync(statePath(), JSON.stringify(state))
    } catch {
      // Not written: the next launch opens maximized, which is fine.
    }
  }
  const saveSoon = () => {
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  }

  window.on('resize', saveSoon)
  window.on('move', saveSoon)
  window.on('maximize', saveSoon)
  window.on('unmaximize', saveSoon)
  window.on('close', save)
}
