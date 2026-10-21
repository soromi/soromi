import { useEffect, useMemo } from 'react'

//Packages
import {
  LocalWebSocketTransport,
  TransportProvider,
  applyServerMessage,
  browserClientId,
  useClientStore,
} from '@soromi/client'
import { setModelCatalog } from '@soromi/ui/chat'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { focusWindow, onNotificationClick, setAppearance, showNotification } from '@/lib/host'

//Constants
import { DAEMON_URL, isElectron } from '@/config'

//App
import { watchAttention } from './attention'

//Components
import { AppLayout } from './app-layout'

/** Root: sets up the theme and transport, routes daemon messages into the store. */
export function App() {
  const transport = useMemo(
    () => new LocalWebSocketTransport(DAEMON_URL, { clientId: browserClientId() }),
    [],
  )
  const theme = useAppStore((s) => s.theme)

  // Apply the appearance as a root class; `theme.css`'s `.so-light` overrides flip every surface.
  // The shell is told too: its window opens in it next time, and its menus and dialogs follow.
  useEffect(() => {
    document.documentElement.classList.toggle('so-light', theme === 'light')
    setAppearance(theme)
  }, [theme])

  // Clicking an OS notification opens the tab it was about (the shell also surfaces the window).
  useEffect(
    () =>
      onNotificationClick((workspace, session) => {
        focusWindow()
        if (!workspace) return
        const ui = useAppStore.getState()
        ui.select(workspace)
        if (session) ui.selectSession(workspace, session)
      }),
    [],
  )

  // Tell the daemon whether someone is at the app, so it holds sounds and banners while they are
  // and pushes them to their phone while they are not: the window behind another, or in front but
  // left untouched for a few minutes (see `attention`). A reconnect starts the daemon over, so it is
  // told again.
  useEffect(() => {
    if (!isElectron) return
    const attention = watchAttention((attended) =>
      transport.send({ type: 'set-focused', focused: attended }),
    )
    const offOpen = transport.onOpen(attention.resend)
    return () => {
      attention.stop()
      offOpen()
    }
  }, [transport])

  useEffect(() => {
    // Daemon-mirrored data lands in the client store; navigation/banners in the UI store.
    const client = useClientStore.getState()
    const ui = useAppStore.getState()

    const offMessage = transport.onMessage((message) => {
      // What the daemon's state is goes into the client store, the same way for every client.
      applyServerMessage(client, message)
      // What follows is this app's own: navigation, notices, the file tree, native banners.
      switch (message.type) {
        case 'workspace-list':
          ui.reconcile(message.workspaces)
          break
        case 'session-opened':
          ui.selectSession(message.workspace, message.session.id)
          break
        case 'workspace-opened':
          ui.select(message.workspace)
          ui.setNotice(message.warning ?? null)
          break
        case 'space-exported':
          ui.setNotice(`Exported soromi.space.json to ${message.path}`)
          break
        case 'dir-listing':
          ui.setListing(message.workspace, message.path, message.entries)
          break
        case 'model-catalog':
          // The catalog store lives in @soromi/ui (outside React); bump a signal so the composer
          // re-renders once it lands.
          setModelCatalog(message.catalog)
          client.bumpModelCatalog()
          break
        case 'git-status':
          ui.setGitStatus(message.workspace, message.folder, message.status, message.repos)
          break
        case 'git-diff':
          ui.setDiffPatch(
            message.workspace,
            message.folder,
            message.path,
            message.staged,
            message.patch,
            message.truncated,
          )
          break
        case 'path-trashed':
          ui.pathTrashed(message.workspace, message.path)
          break
        case 'file-content':
          ui.setFileContent(message.workspace, message.path, {
            content: message.content,
            truncated: message.truncated,
            binary: message.binary,
            image: message.image,
          })
          break
        case 'update-available':
          // Clear any "Checking for updates…" notice from a manual check.
          ui.setNotice(null)
          break
        case 'up-to-date':
          ui.setNotice("You're on the latest version.")
          break
        case 'notify':
          // Agent banner routed here so the native shell shows it with the app identity (Electron;
          // the daemon only sends this to a viewer that opted into native notifications). The
          // workspace/session ride along so a click opens that tab.
          showNotification(message.title, message.body, message.workspace, message.session)
          break
        case 'incompatible':
          // The app and its daemon ship together, so this means a stale one is still running.
          ui.setError(
            message.action === 'update-client'
              ? 'This window is older than the Soromi daemon it reached. Restart Soromi.'
              : 'The Soromi daemon is older than this window. Restart Soromi.',
          )
          break
        case 'error':
          ui.setError(message.message)
          break
      }
    })
    // Re-sync on every (re)connect, so restored spaces reappear after a daemon restart.
    const offOpen = transport.onOpen(() => {
      client.setConnected(true)
      transport.send({ type: 'list-workspaces' })
      // The per-provider model catalogs (the composer's model picker) — provider-owned, fetched here.
      transport.send({ type: 'list-models' })
      // The Electron shell (ad-hoc signed, like Tauri) renders banners natively with the Soromi
      // icon and click-to-open, so opt into wire notifications and let the daemon route them here
      // instead of firing its own osascript banner. Whether someone is at the app is reported by
      // its own watcher (above).
      if (isElectron) transport.send({ type: 'notifications-native', enabled: true })
    })
    const offClose = transport.onClose(() => client.setConnected(false))
    transport.connect()
    return () => {
      offMessage()
      offOpen()
      offClose()
      transport.close()
    }
  }, [transport])

  return (
    <TransportProvider value={transport}>
      <AppLayout />
    </TransportProvider>
  )
}
