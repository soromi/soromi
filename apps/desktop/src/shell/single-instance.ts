// Single-instance enforcement. A second launch would spawn a second daemon against the same
// `~/.soromi` store (double-launching agents), so only the first instance runs; a second launch just
// focuses the existing window.

import { app } from 'electron'
import { showMainWindow } from './window'

/** Returns whether this is the primary instance. The caller aborts startup when it is not. */
export function ensureSingleInstance(): boolean {
  const isPrimary = app.requestSingleInstanceLock()
  if (!isPrimary) {
    app.quit()
    return false
  }
  app.on('second-instance', (_event, argv) => {
    // A stale agent hook can point at the app binary itself (`soromi hook <cue> <agent>`). That
    // launch is not the user reopening the app — surfacing the window would steal focus on every
    // agent event, so ignore it.
    if (argv.includes('hook')) return
    showMainWindow()
  })
  return true
}
