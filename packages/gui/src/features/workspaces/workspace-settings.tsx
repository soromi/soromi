import { Button, Divider, Group, Select, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useEffect, useMemo, useState } from 'react'
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

//Types
import type { AgentAccount } from '@soromi/protocol'

/** Per-workspace settings: pick which account each agent runs under, export, or remove. */
export function WorkspaceSettings({ workspace }: { workspace: string }) {
  const transport = useTransport()
  const { summary, accounts, popOverlay } = useAppStore(
    useShallow((s) => ({
      summary: s.workspaces.find((w) => w.name === workspace),
      accounts: s.accounts,
      popOverlay: s.popOverlay,
    })),
  )

  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  // Every agent that has a binding or a provider we know about gets an editable row.
  const agents = useMemo(
    () => [
      ...new Set([
        ...PROVIDERS.map((p) => p.value),
        ...(summary?.accounts.map((a) => a.agent) ?? []),
      ]),
    ],
    [summary],
  )
  const boundAccount = (agent: string) =>
    summary?.accounts.find((a) => a.agent === agent)?.id ?? 'personal'

  const [bindings, setBindings] = useState<Record<string, string>>(() =>
    Object.fromEntries(agents.map((agent) => [agent, boundAccount(agent)])),
  )

  // Only accounts that actually have a login configured for this agent's provider, plus the
  // built-in `personal` default and whatever the agent is currently bound to.
  const accountOptionsFor = (agent: string) =>
    [
      ...new Set([
        'personal',
        ...accounts.filter((a) => agent in a.providers).map((a) => a.name),
        ...(bindings[agent] ? [bindings[agent]] : []),
      ]),
    ].map((name) => ({ value: name, label: name }))
  const agentLabel = (agent: string) => PROVIDERS.find((p) => p.value === agent)?.label ?? agent

  const changed = agents.some((agent) => (bindings[agent] ?? 'personal') !== boundAccount(agent))
  const save = () => {
    const next: AgentAccount[] = agents.map((agent) => ({
      id: bindings[agent] ?? 'personal',
      agent,
    }))
    transport.send({ type: 'update-space', workspace, accounts: next })
    popOverlay()
  }

  const exportSpace = () => transport.send({ type: 'export-space', workspace })
  const removeSpace = () => {
    modals.openConfirmModal({
      title: 'Remove workspace',
      children: <Text size="sm">Remove "{workspace}"? This stops its agents.</Text>,
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        transport.send({ type: 'remove-space', workspace })
        popOverlay()
      },
    })
  }

  return (
    <OverlayShell title={`Workspace settings · ${workspace}`}>
      <div className={styles.body}>
        <Stack gap="md" maw={420}>
          <div>
            <Title order={4}>{workspace}</Title>
            <Text c="dimmed" size="sm">
              Choose the account each agent runs under. New sessions for that agent use it. Changing
              an account restarts the affected tabs.
            </Text>
          </div>

          {agents.map((agent) => (
            <Select
              key={agent}
              label={
                <span className={styles.agentLabel}>
                  <ProviderIcon provider={agent} size={14} />
                  {agentLabel(agent)}
                </span>
              }
              data={accountOptionsFor(agent)}
              value={bindings[agent] ?? 'personal'}
              onChange={(value) => value && setBindings((prev) => ({ ...prev, [agent]: value }))}
              allowDeselect={false}
            />
          ))}
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
