import { MantineProvider } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
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
import { Disconnected } from '@/features/terminal/disconnected'
import { Welcome } from '@/features/welcome/welcome'
import { WideShell } from '@/features/wide/wide-shell'
import { MobileShell } from './mobile-shell'

/** Root: theme + transport, routes daemon messages into the stores, gates on pairing. */
export function App() {
  // Relay transport when the URL carries relay config, otherwise the standalone mock.
  const { transport, remote } = useMemo(selectTransport, [])
  const paired = useUiStore((s) => s.paired)
  const connected = useClientStore((s) => s.connected)
  const hasWorkspaces = useClientStore((s) => s.workspaces.length > 0)

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
        case 'dir-listing':
          ui.setListing(message.workspace, message.path, message.entries)
          break
        case 'file-content':
          ui.setFileContent(message.path, message.content, message.truncated, message.binary)
          break
        case 'control':
          client.setControlHolder(message.holder ?? null)
          break
      }
    })
    const offOpen = transport.onOpen(() => {
      // A direct link means the daemon itself just connected. On a relay link the socket only
      // reaches the relay, so wait for a presence frame to confirm the daemon is actually there.
      if (!remote) client.setConnected(true)
      transport.send({ type: 'list-workspaces' })
    })
    // On a relay link the socket stays open after the daemon quits; presence is how we learn it
    // went away (and came back). A direct/local transport never fires this.
    const offPresence = transport.onPresence((present) => {
      client.setConnected(present)
      if (present) transport.send({ type: 'list-workspaces' })
    })
    const offClose = transport.onClose(() => client.setConnected(false))
    transport.connect()
    return () => {
      offMessage()
      offOpen()
      offPresence()
      offClose()
      transport.close()
    }
  }, [transport, remote])

  // Desktop-style layout on a wide screen (a PC), the bottom-tab layout on a phone. Seeded from the
  // current width so the right shell paints on the first frame.
  const wide = useMediaQuery('(min-width: 860px)', window.innerWidth >= 860)

  // Connected but the machine has no workspaces: show a welcome, not an empty shell. The shell (with
  // any live terminals) stays for the connected-with-workspaces case; `Disconnected` covers it all
  // when the machine is unreachable.
  const base = !paired ? (
    <ConnectScreen />
  ) : connected && !hasWorkspaces ? (
    <Welcome />
  ) : wide ? (
    <WideShell />
  ) : (
    <MobileShell />
  )

  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      <TransportProvider value={transport}>
        {base}
        {/* Covers the whole app when the daemon is unreachable, so we never show an empty shell. */}
        {paired && <Disconnected />}
      </TransportProvider>
    </MantineProvider>
  )
}
