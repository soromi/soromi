// Native OS notifications. The daemon routes agent-event banners to the shell (see the `notify` IPC
// and the `Notify` protocol message) so they carry the Soromi identity/icon and open the app on
// click. The daemon only sends these while the app is away, so no focus check is needed here.

import { nativeImage, Notification } from 'electron'
import { APP_ICON } from './paths'
import { getMainWindow, showMainWindow } from './window'

export function showNativeNotification(
  title: string,
  body: string,
  workspace: string | null,
  session: string | null,
): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title,
    body,
    icon: nativeImage.createFromPath(APP_ICON),
    // Silent: the daemon plays our own cue (afplay), so let it own the audio — otherwise macOS
    // adds its default notification sound on top and you hear both.
    silent: true,
  })
  notification.on('click', () => {
    // Surface the app, then tell the renderer which tab the banner was about so it opens it.
    showMainWindow()
    getMainWindow()?.webContents.send('notification-click', workspace, session)
  })
  notification.show()
}
