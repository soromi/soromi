import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { onAction } from '@tauri-apps/plugin-notification'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'

//Constants
import { isTauri } from '@/config'

/**
 * The desktop shell's platform calls. This is the only module that talks to Tauri, so the
 * screens stay free of host specifics (a different shell, e.g. web, provides its own).
 */

/** Opens a URL in the user's browser (Tauri opener), falling back to a new tab in the browser. */
export function openExternal(url: string) {
  if (isTauri) openUrl(url)
  else window.open(url, '_blank', 'noreferrer')
}

/** Native folder picker; resolves to the chosen path, or null if cancelled or unavailable. */
export async function pickFolder(title: string): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, title })
  return typeof selected === 'string' ? selected : null
}

/** Quits the app (desktop only; a no-op outside the Tauri shell). */
export function quit() {
  if (isTauri) invoke('quit')
}

/** Shows a path in the OS file manager (Finder). Desktop only. */
export function revealInFinder(path: string) {
  if (isTauri) revealItemInDir(path)
}

/** Copies text to the clipboard. */
export function copyText(text: string) {
  void navigator.clipboard?.writeText(text)
}

/** Brings the app window to the front (the window is hidden, not closed, on close). Desktop only. */
export async function focusWindow() {
  if (!isTauri) return

  const window = getCurrentWindow()
  await window.show()
  await window.unminimize()
  await window.setFocus()
}

/** Runs `handler` when an OS notification is clicked (to open the app). Desktop only; no-op else. */
export function onNotificationClick(handler: () => void) {
  if (!isTauri) return
  void onAction(() => handler())
}
