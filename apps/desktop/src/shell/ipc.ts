// The IPC surface the renderer's host layer (`packages/gui/src/lib/host.ts`) calls through the
// preload bridge (`packages/gui/src/lib/host.ts`).

import { app, dialog, ipcMain, shell } from 'electron'
import { markQuitting } from './lifecycle'
import { showNativeNotification } from './notifications'
import { getMainWindow, showMainWindow } from './window'

export function registerIpcHandlers(): void {
  ipcMain.handle('quit', () => {
    markQuitting()
    app.quit()
  })

  ipcMain.handle('pick-folder', async (_event, title: string) => {
    const window = getMainWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      title,
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('open-external', (_event, url: string) => shell.openExternal(url))

  ipcMain.handle('reveal', (_event, target: string) => shell.showItemInFolder(target))

  ipcMain.handle('focus-window', () => showMainWindow())

  ipcMain.handle(
    'notify',
    (
      _event,
      payload: {
        title: string
        body: string
        workspace: string | null
        session: string | null
      },
    ) => showNativeNotification(payload.title, payload.body, payload.workspace, payload.session),
  )
}
