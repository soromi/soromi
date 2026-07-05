import { Button, Select, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Services
import { useTransport } from '@/services/transport/transport-context'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { PROVIDERS } from '@/config/providers'

//Components
import { OverlayShell } from '@/shared/overlay-shell'

//Styles
import styles from './workspace-settings.module.css'

/** Per-workspace settings: change its agent (provider) and account. Restarts the session. */
export function WorkspaceSettings({ workspace }: { workspace: string }) {
  const transport = useTransport()
  const { summary, accounts, popOverlay } = useAppStore(
    useShallow((s) => ({
      summary: s.workspaces.find((w) => w.name === workspace),
      accounts: s.accounts,
      popOverlay: s.popOverlay,
    })),
  )
  const [agent, setAgent] = useState(summary?.agent ?? 'claude')
  const [account, setAccount] = useState(summary?.account ?? 'personal')

  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  // Known providers, plus the current agent if it isn't one of them.
  const agentOptions = PROVIDERS.some((p) => p.value === agent)
    ? PROVIDERS
    : [...PROVIDERS, { value: agent, label: agent }]
  // Configured accounts, plus the default and whatever this workspace uses now.
  const accountOptions = [...new Set(['personal', account, ...accounts.map((a) => a.name)])].map(
    (name) => ({ value: name, label: name }),
  )

  const changed = agent !== summary?.agent || account !== summary?.account
  const save = () => {
    transport.send({ type: 'update-space', workspace, agent, account })
    popOverlay()
  }

  return (
    <OverlayShell header={<span className={styles.title}>Workspace settings · {workspace}</span>}>
      <div className={styles.body}>
        <Stack gap="md" maw={420}>
          <div>
            <Title order={4}>{workspace}</Title>
            <Text c="dimmed" size="sm">
              Changing the agent or account restarts this workspace's session.
            </Text>
          </div>
          <Select
            label="Agent"
            data={agentOptions}
            value={agent}
            onChange={(value) => value && setAgent(value)}
            allowDeselect={false}
          />
          <Select
            label="Account"
            data={accountOptions}
            value={account}
            onChange={(value) => value && setAccount(value)}
            allowDeselect={false}
          />
          <Button onClick={save} disabled={!changed}>
            Save
          </Button>
        </Stack>
      </div>
    </OverlayShell>
  )
}
