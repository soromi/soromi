import { MantineProvider } from '@mantine/core'
import { useEffect, useMemo } from 'react'

//Packages
import { TransportProvider, useClientStore } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Constants
import { theme } from '@/config/theme'
import { selectTransport } from '@/config/transport'

//Components
import { ConnectScreen } from '@/features/connect/connect-screen'
import { MobileShell } from './mobile-shell'

/** Root: theme + transport, routes daemon messages into the stores, gates on pairing. */
export function App() {
  // Relay transport when the URL carries relay config, otherwise the standalone mock.
  const { transport, remote } = useMemo(selectTransport, [])
  const paired = useUiStore((s) => s.paired)

  // A real relay connection skips the (mock) connect screen; pairing gates it later.
  useEffect(() => {
    if (remote) useUiStore.getState().setPaired(true)
  }, [remote])

  useEffect(() => {
    const client = useClientStore.getState()
    const ui = useUiStore.getState()

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
        case 'status':
          client.setSessionStatus(message.session, message.status)
          break
        case 'session-opened':
          client.addSession(message.workspace, message.session)
          ui.selectSession(message.workspace, message.session.id)
          break
        case 'skill-list':
          client.setSkills(message.session, message.skills)
          break
      }
    })
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
      <TransportProvider value={transport}>
        {paired ? <MobileShell /> : <ConnectScreen />}
      </TransportProvider>
    </MantineProvider>
  )
}
