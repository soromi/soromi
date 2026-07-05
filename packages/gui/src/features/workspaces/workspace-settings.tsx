import { Button, Divider, Group, Select, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
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
import { ProviderIcon } from '@/shared/provider-icon'

//Styles
import styles from './workspace-settings.module.css'

/** Per-workspace settings: change its agent and account, export its config, or remove it. */
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

  const exportSpace = () => {
    transport.send({ type: 'export-space', workspace })
  }
  const removeSpace = () => {
    modals.openConfirmModal({
      title: 'Remove workspace',
      children: <Text size="sm">Remove "{workspace}"? This stops its agent.</Text>,
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        transport.send({ type: 'remove-space', workspace })
        popOverlay()
      },
    })
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
            leftSection={<ProviderIcon provider={agent} />}
            renderOption={({ option }) => (
              <Group gap="xs" wrap="nowrap">
                <ProviderIcon provider={option.value} />
                <span>{option.label}</span>
              </Group>
            )}
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

          <Divider my="xs" />

          <Group>
            <Button variant="default" onClick={exportSpace}>
              Export soromi.space.json
            </Button>
            <Button variant="subtle" color="red" onClick={removeSpace}>
              Remove workspace
            </Button>
          </Group>
        </Stack>
      </div>
    </OverlayShell>
  )
}
