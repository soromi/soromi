import { useCallback } from 'react'

//Services
import { KeychainService } from '@/services/keychain'
import { LinkService } from '@/services/link'

//State
import { resetAllStores } from '@/states/create'
import { WorkspaceStore } from '@/states/workspace/workspace.state'

/**
 * Forgets the computer: the terminals opened on it from here are closed, the pairing leaves the
 * keychain, the link closes, and everything mirrored from it is cleared. The computer keeps its side until the device is revoked there.
 */
export const useUnpair = () =>
  useCallback(async () => {
    // Nothing would be left to close the terminals opened from here, so they go first.
    const shells = Object.values(WorkspaceStore.getState().shells.lists).flat()
    for (const shell of shells) LinkService.send({ type: 'close-session', session: shell.id })
    // And nothing more is to be pushed to this phone from that computer.
    LinkService.setPushToken(null)
    await KeychainService.forgetPairing()
    LinkService.disconnect()
    resetAllStores()
  }, [])
