import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@soromi/ui'

//Constants
import { PROVIDERS } from '@/config/providers'

//Components
import { OverlayShell } from '@/shared/overlay-shell'
import { RemoteSettings } from './remote-settings'

//Icons
import BellOffSvg from '@/assets/icons/bell-off.svg?react'
import PlusSvg from '@/assets/icons/plus.svg?react'
import SettingsSvg from '@/assets/icons/settings.svg?react'
import TrashSvg from '@/assets/icons/trash.svg?react'

//Styles
import { CARD, DESC, H2, SECTION, SECTION_HEAD } from './styles'

//Types
import type { AccountProfile } from '@soromi/protocol'

/** A card name / muted-workspace label. */
const CARD_NAME = 'font-semibold text-[var(--soromi-text)] text-base'

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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
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

  const unmute = (workspace: string) => {
    setMuted(workspace, false)
    transport.send({ type: 'mute-workspace', workspace, muted: false })
  }

  return (
    <OverlayShell icon={<SettingsSvg width={20} height={20} />} title="Settings">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[980px] px-6 pt-10 pb-20">
          <section className={SECTION}>
            <div className={SECTION_HEAD}>
              <div>
                <h2 className={H2}>Accounts</h2>
                <p className={DESC}>
                  An account bundles per-provider logins. Point a provider at a config directory you
                  already use, or a new one you'll log into from a workspace.
                </p>
              </div>
              <span className="flex-shrink-0 text-[var(--soromi-text-faint)] text-sm">
                {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
              </span>
            </div>

            {accountRows.map((account) => (
              <div key={account.name} className={CARD}>
                <div className="flex items-center gap-3.5 px-[18px] py-4">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-[var(--soromi-accent)] font-bold text-[15px] text-[var(--soromi-accent-on)]">
                    {account.initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={CARD_NAME}>{account.name}</div>
                    <div className="mt-0.5 text-[13px] text-[var(--soromi-text-faint)]">
                      {account.providers.length}{' '}
                      {account.providers.length === 1 ? 'provider' : 'providers'} connected
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex cursor-pointer appearance-none items-center gap-1.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 font-medium text-[#f87171] text-sm hover:bg-[rgb(248_113_113/0.1)]"
                    onClick={() => setDeleteTarget(account.name)}
                  >
                    <TrashSvg width={15} height={15} />
                    Delete
                  </button>
                </div>
                <div className="flex flex-col gap-2.5 border-[var(--soromi-border)] border-t px-[18px] py-3.5">
                  {account.providers.map((entry) => (
                    <div key={entry.provider} className="flex items-center gap-4">
                      <span className="w-[70px] flex-none font-semibold text-[var(--soromi-text)] text-sm">
                        {entry.label}
                      </span>
                      <span
                        className={cn(
                          'inline-flex w-[130px] flex-none items-center gap-1.5 text-[13px]',
                          entry.connected
                            ? 'text-[var(--soromi-accent)]'
                            : 'text-[var(--soromi-text-faint)]',
                        )}
                      >
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full',
                            entry.connected
                              ? 'bg-[var(--soromi-accent)]'
                              : 'bg-[var(--soromi-text-faint)]',
                          )}
                        />
                        {entry.connected ? 'Connected' : 'Not connected'}
                      </span>
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-[var(--soromi-border)] bg-[var(--soromi-bg-tab)] px-3 py-2 text-[13px] text-[var(--soromi-text-dim)] [font-family:var(--soromi-font-mono)]">
                        {entry.dir || '(no path)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <button
              type="button"
              className="inline-flex cursor-pointer appearance-none items-center gap-2 self-start rounded-[10px] border border-[var(--soromi-accent-border)] bg-[var(--soromi-accent-dim)] px-4 py-2.5 font-semibold text-[var(--soromi-accent)] text-sm hover:bg-[#17392a]"
              onClick={() => setFormOpen(true)}
            >
              <PlusSvg width={16} height={16} />
              Add account
            </button>
          </section>

          <div className="my-10 h-px bg-[var(--soromi-border)]" />

          <section className={SECTION}>
            <div className={SECTION_HEAD}>
              <div>
                <h2 className={H2}>Muted workspaces</h2>
                <p className={DESC}>Workspaces with notifications silenced.</p>
              </div>
            </div>

            {mutedNames.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--soromi-border)] border-dashed px-6 py-12 text-center">
                <span className="mb-1.5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--soromi-bg-hover)] text-[var(--soromi-text-faint)]">
                  <BellOffSvg width={22} height={22} />
                </span>
                <div className="text-[15px] text-[var(--soromi-text-dim)]">No muted workspaces</div>
                <div className="text-[13px] text-[var(--soromi-text-faint)]">
                  Silenced workspaces show up here.
                </div>
              </div>
            ) : (
              mutedNames.map((workspace) => (
                <div
                  key={workspace}
                  className="flex items-center justify-between rounded-[10px] border border-[var(--soromi-border)] px-3.5 py-2.5"
                >
                  <span className={CARD_NAME}>{workspace}</span>
                  <Button variant="ghost" size="sm" onClick={() => unmute(workspace)}>
                    Unmute
                  </Button>
                </div>
              ))
            )}
          </section>

          <div className="my-10 h-px bg-[var(--soromi-border)]" />

          <RemoteSettings />
        </div>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent title="New account" className="max-w-lg">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-name">Name</Label>
                <Input
                  id="account-name"
                  placeholder="e.g. work"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              {rows.map((row, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and stable.
                <div key={index} className="flex items-end gap-2">
                  <div className="flex w-36 flex-col gap-1.5">
                    {index === 0 && <Label>Provider</Label>}
                    <Select
                      value={row.provider}
                      onValueChange={(value) => value && updateRow(index, { provider: value })}
                    >
                      <SelectTrigger onBlur={() => check(row.provider, row.configDir)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map((provider) => (
                          <SelectItem key={provider.value} value={provider.value}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    {index === 0 && <Label>Config directory</Label>}
                    <div className="relative">
                      <Input
                        className="pr-8"
                        placeholder="~/.claude"
                        value={row.configDir}
                        onChange={(event) => updateRow(index, { configDir: event.target.value })}
                        onBlur={() => check(row.provider, row.configDir)}
                      />
                      <span className="-translate-y-1/2 absolute top-1/2 right-2">
                        <StatusDot
                          status={providerStatus[statusKey(row.provider, row.configDir.trim())]}
                        />
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => fillIsolatedDir(index)}>
                    New
                  </Button>
                  {rows.length > 1 && (
                    <Button variant="ghost" onClick={() => removeRow(index)}>
                      ✕
                    </Button>
                  )}
                </div>
              ))}
              <div className="mt-1 flex justify-between">
                <Button variant="secondary" onClick={addRow}>
                  <PlusSvg width={14} height={14} />
                  Add provider
                </Button>
                <Button onClick={create} disabled={!name.trim()}>
                  Save account
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete account"
        destructive
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) transport.send({ type: 'delete-account', name: deleteTarget })
          setDeleteTarget(null)
        }}
      >
        Delete account "{deleteTarget}"? This removes its stored logins.
      </ConfirmDialog>
    </OverlayShell>
  )
}

/** Logged-in indicator: green when logged in, amber when not, gray when unchecked. */
function StatusDot({ status }: { status: boolean | undefined }) {
  const title = status === undefined ? 'Not checked' : status ? 'Logged in' : 'Not logged in'
  return (
    <span
      className={cn(
        'h-2 w-2 flex-shrink-0 rounded-full',
        status === undefined
          ? 'bg-[var(--soromi-text-faint)]'
          : status
            ? 'bg-[var(--soromi-ok)]'
            : 'bg-[var(--soromi-warn)]',
      )}
      title={title}
    />
  )
}
