import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { useEffect, useMemo } from 'react'

//Services
import { LocalWebSocketTransport } from '@/services/transport/local-websocket-transport'
import { TransportProvider } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { DAEMON_URL } from '@/config'
import { theme } from '@/config/theme'

//Components
import { AppLayout } from './app-layout'

/** Root: sets up the theme and transport, routes daemon messages into the store. */
export function App() {
  const transport = useMemo(() => new LocalWebSocketTransport(DAEMON_URL), [])

  useEffect(() => {
    const store = useAppStore.getState()

    const offMessage = transport.onMessage((message) => {
      switch (message.type) {
        case 'workspace-list':
          store.setWorkspaces(message.workspaces)
          break
        case 'keep-awake':
          store.setKeepAwake(message.active)
          store.setKeepAwakeMode(message.mode)
          break
        case 'account-list':
          store.setAccounts(message.accounts)
          break
        case 'provider-status':
          store.setProviderStatus(message.provider, message.configDir, message.loggedIn)
          break
        case 'status':
          store.setSessionStatus(message.session, message.status)
          break
        case 'session-opened':
          store.addSession(message.workspace, message.session)
          break
        case 'workspace-opened':
          store.select(message.workspace)
          store.setNotice(message.warning ?? null)
          break
        case 'space-exported':
          store.setNotice(`Exported soromi.space.json to ${message.path}`)
          break
        case 'dir-listing':
          store.setListing(message.workspace, message.path, message.entries)
          break
        case 'skill-list':
          store.setSkills(message.session, message.skills)
          break
        case 'file-content':
          store.setFileContent(message.workspace, message.path, {
            content: message.content,
            truncated: message.truncated,
            binary: message.binary,
          })
          break
        case 'update-available':
          store.setUpdate({
            version: message.version,
            url: message.url,
            notes: message.notes ?? null,
          })
          // Clear any "Checking for updates…" notice from a manual check.
          store.setNotice(null)
          break
        case 'up-to-date':
          store.setNotice("You're on the latest version.")
          break
        case 'error':
          store.setError(message.message)
          break
      }
    })
    // Re-sync on every (re)connect, so restored spaces reappear after a daemon restart.
    const offOpen = transport.onOpen(() => {
      store.setConnected(true)
      transport.send({ type: 'list-workspaces' })
    })
    const offClose = transport.onClose(() => store.setConnected(false))
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
