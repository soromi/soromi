import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { useEffect, useMemo } from 'react'

//Packages
import { LocalWebSocketTransport, TransportProvider, useClientStore } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { focusWindow, onNotificationClick } from '@/lib/host'

//Constants
import { DAEMON_URL } from '@/config'
import { theme } from '@/config/theme'

//Components
import { AppLayout } from './app-layout'

/** Root: sets up the theme and transport, routes daemon messages into the store. */
export function App() {
  const transport = useMemo(() => new LocalWebSocketTransport(DAEMON_URL), [])

  // Clicking an OS notification brings the app forward (the window is hidden, not closed, on close).
  useEffect(() => onNotificationClick(focusWindow), [])

  useEffect(() => {
    // Daemon-mirrored data lands in the client store; navigation/banners in the UI store.
    const client = useClientStore.getState()
    const ui = useAppStore.getState()

    const offMessage = transport.onMessage((message) => {
      switch (message.type) {
        case 'workspace-list':
          client.setWorkspaces(message.workspaces)
          ui.reconcile(message.workspaces)
          break
        case 'keep-awake':
          client.setKeepAwake(message.active)
          client.setKeepAwakeMode(message.mode)
          break
        case 'account-list':
          client.setAccounts(message.accounts)
          break
        case 'provider-status':
          client.setProviderStatus(message.provider, message.configDir, message.loggedIn)
          break
        case 'status':
          client.setSessionStatus(message.session, message.status)
          break
        case 'session-opened':
          client.addSession(message.workspace, message.session)
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
        case 'skill-list':
          client.setSkills(message.session, message.skills)
          break
        case 'file-content':
          ui.setFileContent(message.workspace, message.path, {
            content: message.content,
            truncated: message.truncated,
            binary: message.binary,
          })
          break
        case 'update-available':
          client.setUpdate({
            version: message.version,
            url: message.url,
            notes: message.notes ?? null,
          })
          // Clear any "Checking for updates…" notice from a manual check.
          ui.setNotice(null)
          break
        case 'up-to-date':
          ui.setNotice("You're on the latest version.")
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
    <MantineProvider theme={theme} forceColorScheme="dark">
      <ModalsProvider>
        <TransportProvider value={transport}>
          <AppLayout />
        </TransportProvider>
      </ModalsProvider>
    </MantineProvider>
  )
}
