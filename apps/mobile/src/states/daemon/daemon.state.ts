import { createClientStore } from '@soromi/core'

//State
import { register } from '../create'

/**
 * What the daemon streams: workspaces, sessions, chat, who is in control. The store itself is
 * `@soromi/core`'s, the same one the desktop app mirrors the daemon into; this app only reads it
 * and lets the link fill it.
 */
export const DaemonStore = createClientStore()

register(DaemonStore)
