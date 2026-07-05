import { Button, Group, Modal, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import clsx from 'clsx'
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
import styles from './settings.module.css'

//Types
import type { AccountProfile } from '@soromi/protocol'

interface ProviderRow {
  provider: string
  configDir: string
}

const statusKey = (provider: string, configDir: string) => `${provider}::${configDir}`

/** Settings overlay: account profiles (per-provider logins), plus notification mutes. */
export function Settings() {
  const transport = useTransport()
  const { accounts, workspaces, muted, providerStatus, setMuted } = useAppStore(
    useShallow((s) => ({
      accounts: s.accounts,
      workspaces: s.workspaces,
      muted: s.muted,
      providerStatus: s.providerStatus,
      setMuted: s.setMuted,
    })),
  )
  const [name, setName] = useState('')
  const [rows, setRows] = useState<ProviderRow[]>([{ provider: 'claude', configDir: '' }])
  const [formOpen, setFormOpen] = useState(false)
  const mutedNames = workspaces.filter((w) => muted[w.name]).map((w) => w.name)

  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  // Validate each existing account's providers so the list can show logged-in status.
  useEffect(() => {
    for (const account of accounts) {
      for (const [provider, config] of Object.entries(account.providers)) {
        if (config?.configDir) {
          transport.send({ type: 'check-provider', provider, configDir: config.configDir })
        }
      }
    }
  }, [accounts, transport])

  const check = (provider: string, configDir: string) => {
    const dir = configDir.trim()
    if (dir) transport.send({ type: 'check-provider', provider, configDir: dir })
  }

  const updateRow = (index: number, patch: Partial<ProviderRow>) =>
    setRows((rs) => rs.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const addRow = () => setRows((rs) => [...rs, { provider: 'codex', configDir: '' }])
  const removeRow = (index: number) => setRows((rs) => rs.filter((_, i) => i !== index))
  const fillIsolatedDir = (index: number) => {
    const account = name.trim() || 'account'
    updateRow(index, { configDir: `~/.soromi/accounts/${account}/${rows[index].provider}` })
  }

  const create = () => {
    const account = name.trim()
    if (!account) return
    const providers: AccountProfile['providers'] = {}
    for (const row of rows) {
      const dir = row.configDir.trim()
      if (dir) providers[row.provider] = { configDir: dir }
    }
    if (Object.keys(providers).length === 0) return
    transport.send({ type: 'save-account', profile: { name: account, providers } })
    setName('')
    setRows([{ provider: 'claude', configDir: '' }])
    setFormOpen(false)
  }

  const remove = (account: string) => {
    modals.openConfirmModal({
      title: 'Delete account',
      children: <Text size="sm">Delete account "{account}"? This removes its stored logins.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => transport.send({ type: 'delete-account', name: account }),
    })
  }

  const unmute = (workspace: string) => {
    setMuted(workspace, false)
    transport.send({ type: 'mute-workspace', workspace, muted: false })
  }

  return (
    <OverlayShell header={<span className={styles.title}>Settings</span>}>
      <div className={styles.body}>
        <Stack gap="lg" maw={640}>
          <div>
            <Title order={4}>Accounts</Title>
            <Text c="dimmed" size="sm">
              An account bundles per-provider logins. Point a provider at a config directory you
              already use, or at a new one you'll log into from a workspace (use New).
            </Text>
          </div>

          <Stack gap="xs">
            {accounts.length === 0 ? (
              <Text c="dimmed" size="sm">
                No accounts yet.
              </Text>
            ) : (
              accounts.map((account) => (
                <div key={account.name} className={styles.row}>
                  <Group justify="space-between">
                    <Text fw={500}>{account.name}</Text>
                    <Button
                      variant="subtle"
                      color="red"
                      size="compact-sm"
                      onClick={() => remove(account.name)}
                    >
                      Delete
                    </Button>
                  </Group>
                  <Stack gap={4} mt={6}>
                    {Object.entries(account.providers).map(([provider, config]) => {
                      const dir = config?.configDir ?? ''
                      return (
                        <Group key={provider} gap="xs" wrap="nowrap">
                          <Text size="xs" fw={500} tt="capitalize" w={54}>
                            {provider}
                          </Text>
                          <StatusDot status={providerStatus[statusKey(provider, dir)]} />
                          <Text size="xs" c="dimmed" className={styles.path}>
                            {dir || '(no path)'}
                          </Text>
                        </Group>
                      )
                    })}
                  </Stack>
                </div>
              ))
            )}
          </Stack>

          <Group>
            <Button variant="light" onClick={() => setFormOpen(true)}>
              Add new
            </Button>
          </Group>

          <Modal
            opened={formOpen}
            onClose={() => setFormOpen(false)}
            title="New account"
            centered
            size="lg"
          >
            <Stack gap="sm">
              <TextInput
                label="Name"
                placeholder="e.g. work"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              {rows.map((row, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and stable.
                <Group key={index} align="flex-end" gap="xs" wrap="nowrap">
                  <Select
                    w={116}
                    label={index === 0 ? 'Provider' : undefined}
                    data={PROVIDERS}
                    value={row.provider}
                    onChange={(value) => value && updateRow(index, { provider: value })}
                    allowDeselect={false}
                    onBlur={() => check(row.provider, row.configDir)}
                  />
                  <TextInput
                    flex={1}
                    label={index === 0 ? 'Config directory' : undefined}
                    placeholder="~/.claude"
                    value={row.configDir}
                    onChange={(event) => updateRow(index, { configDir: event.currentTarget.value })}
                    onBlur={() => check(row.provider, row.configDir)}
                    rightSection={
                      <StatusDot
                        status={providerStatus[statusKey(row.provider, row.configDir.trim())]}
                      />
                    }
                  />
                  <Button variant="subtle" size="compact-sm" onClick={() => fillIsolatedDir(index)}>
                    New
                  </Button>
                  {rows.length > 1 && (
                    <Button
                      variant="subtle"
                      color="red"
                      size="compact-sm"
                      onClick={() => removeRow(index)}
                    >
                      ✕
                    </Button>
                  )}
                </Group>
              ))}
              <Group>
                <Button variant="light" onClick={addRow}>
                  Add provider
                </Button>
                <Button onClick={create} disabled={!name.trim()}>
                  Save account
                </Button>
              </Group>
            </Stack>
          </Modal>

          <div>
            <Title order={4}>Muted workspaces</Title>
            <Text c="dimmed" size="sm">
              Workspaces with notifications silenced.
            </Text>
          </div>

          <Stack gap="xs">
            {mutedNames.length === 0 ? (
              <Text c="dimmed" size="sm">
                No muted workspaces.
              </Text>
            ) : (
              mutedNames.map((workspace) => (
                <Group key={workspace} justify="space-between" className={styles.row}>
                  <Text fw={500}>{workspace}</Text>
                  <Button variant="subtle" size="compact-sm" onClick={() => unmute(workspace)}>
                    Unmute
                  </Button>
                </Group>
              ))
            )}
          </Stack>
        </Stack>
      </div>
    </OverlayShell>
  )
}

/** Logged-in indicator: green when logged in, amber when not, gray when unchecked. */
function StatusDot({ status }: { status: boolean | undefined }) {
  const title = status === undefined ? 'Not checked' : status ? 'Logged in' : 'Not logged in'
  return (
    <span
      className={clsx(
        styles.dot,
        status === undefined ? styles.dotUnknown : status ? styles.dotOk : styles.dotWarn,
      )}
      title={title}
    />
  )
}
