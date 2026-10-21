import { RoutedTransport, applyServerMessage } from '@soromi/core'

//Constants
import { LINK } from './link.constants'

//Helpers
import {
  confirmSend,
  getStatusAfterClose,
  getStatusFromIncompatible,
  isRetryable,
} from './link.helpers'

//Services
import { DeviceService } from './device'
import { KeychainService } from './keychain'

//State
import { DaemonStore } from '@/states/daemon/daemon.state'
import { LinkStore } from '@/states/link/link.state'
import { WorkspaceStore } from '@/states/workspace/workspace.state'

//Type
import type { Pairing } from '@soromi/core'
import type { ClientMessage, ServerMessage } from '@soromi/protocol'
import type { BannerListener } from './link.type'

let transport: RoutedTransport | null = null
/** Who shows the daemon's banners, while someone does. It outlives any one transport. */
let bannerListener: BannerListener | null = null
/** What the daemon pushes banners to this phone with, once the phone has one. */
let pushToken: string | null = null
/**
 * Who waits for a link to be made, to send on it: an answer given from a banner that started the
 * app, before it had read the keychain. The next link to be made is handed to each.
 */
let linkWaiters: Array<(link: RoutedTransport) => void> = []
/** Who keeps the relay the computer says it is reached through, while someone does. */
let relayListener: ((url: string) => void) | null = null
/** Whether the app is on screen, which decides if banners come over the link or are pushed. */
let attended = true

/** The daemon's answers about a workspace's files and git go to the workspace store. */
const routeToWorkspace = (message: ServerMessage): void => {
  const workspace = WorkspaceStore.getState().actions
  switch (message.type) {
    case 'dir-listing':
      workspace.setListing(message.workspace, message.path, message.entries)
      break
    case 'file-content':
      workspace.setFile(message.workspace, message.path, {
        content: message.content,
        truncated: message.truncated,
        binary: message.binary,
        image: message.image,
      })
      break
    case 'path-trashed':
      workspace.forgetPath(message.workspace, message.path)
      break
    case 'file-saved':
      workspace.finishSave(message.workspace, message.path)
      break
    case 'git-status':
      workspace.setGitStatus(message.workspace, message.folder, message.status, message.repos)
      break
    case 'folder-listing': {
      const { type: _, ...listing } = message
      workspace.setFolderListing(listing)
      break
    }
    case 'git-diff':
      workspace.setDiff(message.workspace, message.folder, message.path, message.staged, {
        patch: message.patch,
        truncated: message.truncated,
      })
      break
  }
}

/** The link in use, now or once one is made, within `ms`; `null` if none is made by then. */
const nextLink = (ms: number): Promise<RoutedTransport | null> => {
  if (transport) return Promise.resolve(transport)

  return new Promise((resolve) => {
    const waiter = (link: RoutedTransport) => {
      clearTimeout(timer)
      resolve(link)
    }
    const timer = setTimeout(() => {
      linkWaiters = linkWaiters.filter((other) => other !== waiter)
      resolve(null)
    }, ms)
    linkWaiters.push(waiter)
  })
}

/**
 * The link to the user's computer: one end-to-end encrypted connection from `@soromi/core`, by
 * whichever route answers: straight to the computer when the phone shares a network with it, and
 * through the relay otherwise. What the daemon streams lands in `DaemonStore`; where the link
 * stands, in `LinkStore`. This is the only place that holds the transport.
 */
export const LinkService = {
  /**
   * Connects with a pairing, dropping any link there was. `routes` are the direct addresses the
   * computer reported last time, tried before the relay; it says them again once connected.
   */
  connect: (pairing: Pairing, clientId: string, routes: string[] = []): void => {
    LinkService.disconnect()
    const link = LinkStore.getState().actions
    const next = new RoutedTransport(
      {
        relay: { relayUrl: pairing.relay, room: pairing.room, key: pairing.key },
        device: pairing.device,
        routes,
      },
      // The computer lists the phone under the name it gives here.
      { clientId, deviceName: DeviceService.name() },
    )
    transport = next
    // The link holds what it is given until a route answers, so these go out as soon as one does.
    for (const waiter of linkWaiters) waiter(next)
    linkWaiters = []
    link.setStatus('connecting')
    link.setRoute(null)
    link.setError(null)

    next.onRoute((route) => {
      link.setRoute(route)
      if (route) link.linkUp()
      else link.linkDown()
    })
    next.onLatency(link.addSample)
    next.onRoutes((learned) => void KeychainService.saveRoutes(pairing.device, learned))
    next.onMessage((message) => {
      applyServerMessage(DaemonStore.getState(), message)
      routeToWorkspace(message)
      if (message.type === 'notify') {
        bannerListener?.(message)
      } else if (message.type === 'relay') {
        relayListener?.(message.url)
      } else if (message.type === 'incompatible') {
        link.setStatus(getStatusFromIncompatible(message.action))
      } else if (message.type === 'error') {
        link.setError(message.message)
      }
    })
    next.onOpen(() => {
      DaemonStore.getState().setConnected(true)
      link.setStatus('online')
      // The daemon starts every connection from nothing: ask again for what the app always shows.
      for (const type of LINK.onOpen) next.send({ type })
      // And tell it again how this phone takes its banners.
      if (bannerListener) next.send({ type: 'notifications-native', enabled: true })
      if (pushToken) next.send({ type: 'register-push', token: pushToken })
      next.send({ type: 'set-focused', focused: attended })
    })
    next.onClose((code) => {
      DaemonStore.getState().setConnected(false)
      link.setStatus(getStatusAfterClose(LinkStore.getState().connection.status, code))
    })
    // The computer is not there: the relay says it left, or no route has answered for a while
    // (it is asleep, which no socket reports).
    next.onPresence((present) => {
      if (present) return
      DaemonStore.getState().setConnected(false)
      link.setStatus('computer-offline')
    })
    next.connect()
  },

  disconnect: (): void => {
    transport?.close()
    transport = null
  },

  /**
   * The app came back to the foreground, or the phone's network changed. Checks that the link
   * still answers (a socket that sat in the background is often dead without knowing), dials at
   * once if there is none, and tries the direct routes again: this is when being on the same
   * network as the computer starts or stops being true.
   */
  recheck: (): void => {
    if (!transport) return
    const link = LinkStore.getState()
    // Say that it is being tried again; if nothing answers, the transport says so in turn.
    if (!transport.isOpen() && isRetryable(link.connection.status)) {
      link.actions.setStatus('connecting')
    }
    transport.recheck()
  },

  /** Times one round trip to the computer now; the answer lands in the link's quality. */
  measure: (): void => {
    transport?.measure()
  },

  /**
   * Sends a message that must not be lost, and says whether the computer has it, within `ms`:
   * over the link, now or once a route answers, or once one is made for an app that is only
   * starting (an answer given from a banner that started it). For what is sent while the app may
   * be about to be put away.
   */
  sendConfirmed: async (message: ClientMessage, ms: number): Promise<boolean> => {
    const started = Date.now()
    const link = await nextLink(ms)
    if (!link) return false

    return confirmSend(link, message, ms - (Date.now() - started))
  },

  /**
   * The same over a link of its own to a computer, made for this one message and closed after:
   * for one the app is not linked to (a banner from another computer it is paired with), or an
   * app the system started with no screen, to answer a banner's button. Through the relay it
   * takes the computer from any other link of this phone's, which is why it is not used while
   * the app has one to it.
   */
  sendOnce: (
    pairing: Pairing,
    clientId: string,
    routes: string[],
    message: ClientMessage,
    ms: number,
  ): Promise<boolean> => {
    const link = new RoutedTransport(
      {
        relay: { relayUrl: pairing.relay, room: pairing.room, key: pairing.key },
        device: pairing.device,
        routes,
      },
      { clientId, deviceName: DeviceService.name() },
    )
    const sent = confirmSend(link, message, ms).finally(() => link.close())
    link.connect()

    return sent
  },

  /** Sends a message to the daemon, or drops it if there is no link. */
  send: (message: ClientMessage): void => {
    transport?.send(message)
  },

  /**
   * Calls `listener` with each piece of terminal output for an attached session; returns how to
   * stop. Output is not kept anywhere: it goes to whoever is drawing the terminal, or nowhere.
   */
  onOutput: (listener: (session: string, data: string) => void): (() => void) =>
    transport?.onOutput(listener) ?? (() => {}),

  /**
   * Calls `listener` with each message from the daemon, after it has been put in the stores;
   * returns how to stop. For the few things that are an event to act on rather than state to
   * keep: a terminal's size changing, a session starting over.
   */
  onMessage: (listener: (message: ServerMessage) => void): (() => void) =>
    transport?.onMessage(listener) ?? (() => {}),

  /**
   * Asks the daemon for its banners (a task finished, an agent is waiting for an answer) and calls
   * `listener` with each one; returns how to stop. The daemon is asked again every time the link
   * opens, whichever computer that is to, so this is called once and left on. One listener at a
   * time: banners are shown in one place.
   */
  /**
   * Hands on the relay the computer says it is reached through, each time it says (after `hello`,
   * and when it changes there). Returns how to stop.
   */
  onRelay: (listener: (url: string) => void): (() => void) => {
    relayListener = listener

    return () => {
      if (relayListener === listener) relayListener = null
    }
  },

  watchBanners: (listener: BannerListener): (() => void) => {
    bannerListener = listener
    if (transport?.isOpen()) transport.send({ type: 'notifications-native', enabled: true })

    return () => {
      if (bannerListener !== listener) return
      bannerListener = null
      if (transport?.isOpen()) transport.send({ type: 'notifications-native', enabled: false })
    }
  },

  /**
   * Gives the daemon the token to push banners to this phone with, for when the app is closed or
   * behind another one, or takes it back (`null`). The daemon is told again every time the link
   * opens.
   */
  setPushToken: (token: string | null): void => {
    if (token === pushToken) return
    pushToken = token
    if (transport?.isOpen()) transport.send({ type: 'register-push', token })
  },

  /**
   * Asks the computer in use to stop pushing banners to this phone, which is about to forget it.
   * The token stays, for the other computers the phone is paired with.
   */
  stopPushHere: (): void => {
    if (transport?.isOpen()) transport.send({ type: 'register-push', token: null })
  },

  /**
   * Says whether the app is on screen. While it is, the daemon sends banners over the link; once
   * it is not, it pushes them, since the system is about to cut the link off.
   */
  setAttended: (next: boolean): void => {
    if (next === attended) return
    attended = next
    if (transport?.isOpen()) transport.send({ type: 'set-focused', focused: next })
  },

  /** Calls `listener` each time the link to the daemon (re)opens; returns how to stop. */
  onOpen: (listener: () => void): (() => void) => transport?.onOpen(listener) ?? (() => {}),
}
