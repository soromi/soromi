// The app's light or dark appearance, as the main process needs it: the color the window opens
// in, before the page draws anything, and the appearance of the native parts (menus, dialogs, the
// title bar's controls). The renderer chooses it (Settings, the toggle) and tells the shell, which
// keeps it for the next launch.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { type BrowserWindow, app, nativeTheme } from 'electron'

export type Appearance = 'dark' | 'light'

const FILE = 'appearance.json'

/** The page's shell color in each appearance (`--soromi-bg-shell` in the ui's `theme.css`). */
const BACKGROUND: Record<Appearance, string> = { dark: '#09090a', light: '#f3f3f1' }

const appearancePath = (): string => path.join(app.getPath('userData'), FILE)

export const isAppearance = (value: unknown): value is Appearance =>
  value === 'dark' || value === 'light'

/** The appearance last chosen; dark, as the app starts, when none was. */
export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(fs.readFileSync(appearancePath(), 'utf8'))
    return isAppearance(saved.theme) ? saved.theme : 'dark'
  } catch {
    return 'dark'
  }
}

/** The color a window opens in, for an appearance. */
export const backgroundFor = (appearance: Appearance): string => BACKGROUND[appearance]

/** Keeps an appearance for the next launch, and gives the native parts and `window` its colors. */
export function applyAppearance(appearance: Appearance, window: BrowserWindow | null): void {
  nativeTheme.themeSource = appearance
  window?.setBackgroundColor(BACKGROUND[appearance])
  try {
    fs.writeFileSync(appearancePath(), JSON.stringify({ theme: appearance }))
  } catch {
    // Not kept: the next launch opens dark until the page says otherwise.
  }
}
