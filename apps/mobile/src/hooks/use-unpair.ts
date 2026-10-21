import { useCallback } from 'react'

//Services
import { ComputersService } from '@/services/computers'
import { LinkService } from '@/services/link'

//State
import { DaemonStore } from '@/states/daemon/daemon.state'
import { LinkStore } from '@/states/link/link.state'

/**
 * Forgets the computer in use: its pairing leaves the keychain, and the phone goes on with
 * another computer it is paired with, or with none. The computer keeps its side until the device
 * is revoked there.
 *
 * On a computer with nobody at it (Soromi started from a terminal, or as a service on a server)
 * the terminals this phone opened are closed first: nothing would be left to close them. On the
 * desktop app's computer they are left running, since its terminals are the desktop's to manage.
 */
export const useUnpair = () =>
  useCallback(async () => {
    const device = LinkStore.getState().pairing.current?.device
    const daemon = DaemonStore.getState()
    const unattended = daemon.host !== null && daemon.host.launcher !== 'desktop'
    if (unattended && device) {
      for (const workspace of daemon.workspaces) {
        for (const shell of workspace.shells ?? []) {
          if (shell.openedBy === device) {
            LinkService.send({ type: 'close-session', session: shell.id })
          }
        }
      }
    }
    await ComputersService.forgetCurrent()
  }, [])
