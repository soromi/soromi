import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { modals } from '@mantine/modals'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Constants
import { PROVIDERS } from '@/config/providers'

//Components
import { OverlayShell } from '@/shared/overlay-shell'

//Icons
import BellOffSvg from '@/assets/icons/bell-off.svg?react'
import PlusSvg from '@/assets/icons/plus.svg?react'
import SettingsSvg from '@/assets/icons/settings.svg?react'
import TrashSvg from '@/assets/icons/trash.svg?react'

//Styles
import styles from './settings.module.css'

//Types
import type { AccountProfile } from '@soromi/protocol'

interface ProviderRow {
  provider: string
  configDir: string
}

const statusKey = (provider: string, configDir: string) => `${provider}::${configDir}`
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** Settings overlay: account profiles (per-provider logins), plus notification mutes. */
export function Settings() {
  const transport = useTransport()
  const { accounts, workspaces, muted, providerStatus, setMuted } = useClientStore(
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

  // Prepare each account's view data once, so the JSX maps below only render (no per-item logic).
  const accountRows = useMemo(
    () =>
      accounts.map((account) => ({
        name: account.name,
        initial: account.name.charAt(0).toUpperCase(),
        providers: Object.entries(account.providers).map(([provider, config]) => {
          const dir = config?.configDir ?? ''

          return {
            provider,
            label: capitalize(provider),
            dir,
            connected: providerStatus[statusKey(provider, dir)],
          }
        }),
      })),
    [accounts, providerStatus],
  )

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
    <OverlayShell icon={<SettingsSvg width={20} height={20} />} title="Settings">
      <div className={styles.body}>
        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.h2}>Accounts</h2>
                <p className={styles.desc}>
                  An account bundles per-provider logins. Point a provider at a config directory you
                  already use, or a new one you'll log into from a workspace.
                </p>
              </div>
              <span className={styles.count}>
                {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
              </span>
            </div>

            {accountRows.map((account) => (
              <div key={account.name} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.avatar}>{account.initial}</span>
                  <div className={styles.cardHeadText}>
                    <div className={styles.cardName}>{account.name}</div>
                    <div className={styles.cardMeta}>
                      {account.providers.length}{' '}
                      {account.providers.length === 1 ? 'provider' : 'providers'} connected
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.delete}
                    onClick={() => remove(account.name)}
                  >
                    <TrashSvg width={15} height={15} />
                    Delete
                  </button>
                </div>
                <div className={styles.cardBody}>
                  {account.providers.map((entry) => (
                    <div key={entry.provider} className={styles.providerRow}>
                      <span className={styles.providerName}>{entry.label}</span>
                      <span
                        className={clsx(styles.providerStatus, entry.connected && styles.connected)}
                      >
                        <span className={styles.statusDot} />
                        {entry.connected ? 'Connected' : 'Not connected'}
                      </span>
                      <span className={styles.providerPath}>{entry.dir || '(no path)'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <button type="button" className={styles.addBtn} onClick={() => setFormOpen(true)}>
              <PlusSvg width={16} height={16} />
              Add account
            </button>
          </section>

          <div className={styles.divider} />

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.h2}>Muted workspaces</h2>
                <p className={styles.desc}>Workspaces with notifications silenced.</p>
              </div>
            </div>

            {mutedNames.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>
                  <BellOffSvg width={22} height={22} />
                </span>
                <div className={styles.emptyTitle}>No muted workspaces</div>
                <div className={styles.emptyDesc}>Silenced workspaces show up here.</div>
              </div>
            ) : (
              mutedNames.map((workspace) => (
                <div key={workspace} className={styles.mutedRow}>
                  <span className={styles.cardName}>{workspace}</span>
                  <Button variant="subtle" size="compact-sm" onClick={() => unmute(workspace)}>
                    Unmute
                  </Button>
                </div>
              ))
            )}
          </section>
        </div>

        <Modal
          opened={formOpen}
          onClose={() => setFormOpen(false)}
          title="New account"
          centered
          size="lg"
        >
          <Stack gap="md">
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
                  w={140}
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
                <Button variant="subtle" onClick={() => fillIsolatedDir(index)}>
                  New
                </Button>
                {rows.length > 1 && (
                  <Button variant="subtle" color="red" onClick={() => removeRow(index)}>
                    ✕
                  </Button>
                )}
              </Group>
            ))}
            <Group justify="space-between" mt="xs">
              <Button
                variant="default"
                leftSection={<PlusSvg width={14} height={14} />}
                onClick={addRow}
              >
                Add provider
              </Button>
              <Button onClick={create} disabled={!name.trim()}>
                Save account
              </Button>
            </Group>
          </Stack>
        </Modal>
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
