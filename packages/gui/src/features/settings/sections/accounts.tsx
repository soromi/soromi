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

//Icons
import PencilSvg from '@/assets/icons/pencil.svg?react'
import PlusSvg from '@/assets/icons/plus.svg?react'
import TrashSvg from '@/assets/icons/trash.svg?react'

//Components
import { SETTINGS_ICON, SETTINGS_PRIMARY, SettingsGroup, SettingsPage } from '../layout'

//Types
import type { AccountProfile } from '@soromi/protocol'

interface ProviderRow {
  provider: string
  configDir: string
}

const statusKey = (provider: string, configDir: string) => `${provider}::${configDir}`
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** Account profiles: the connected per-provider logins, with an "add account" form. */
export function AccountsSection() {
  const transport = useTransport()
  const { accounts, providerStatus } = useClientStore(
    useShallow((s) => ({ accounts: s.accounts, providerStatus: s.providerStatus })),
  )
  const [name, setName] = useState('')
  const [rows, setRows] = useState<ProviderRow[]>([{ provider: 'claude', configDir: '' }])
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  // The original name of the account being edited (null = the form is adding a new account). On save
  // we upsert by name; a rename also removes the old profile.
  const [editing, setEditing] = useState<string | null>(null)

  // Prepare each account's view data once, so the JSX map below only renders (no per-item logic).
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

  const resetForm = () => {
    setEditing(null)
    setName('')
    setRows([{ provider: 'claude', configDir: '' }])
  }
  const startNew = () => {
    resetForm()
    setFormOpen(true)
  }
  const startEdit = (account: (typeof accountRows)[number]) => {
    setEditing(account.name)
    setName(account.name)
    setRows(
      account.providers.length > 0
        ? account.providers.map((entry) => ({ provider: entry.provider, configDir: entry.dir }))
        : [{ provider: 'claude', configDir: '' }],
    )
    setFormOpen(true)
  }

  const save = () => {
    const account = name.trim()
    if (!account) return
    const providers: AccountProfile['providers'] = {}
    for (const row of rows) {
      const dir = row.configDir.trim()
      if (dir) providers[row.provider] = { configDir: dir }
    }
    if (Object.keys(providers).length === 0) return
    // A rename writes to a new profile dir, so remove the old one.
    if (editing && editing !== account) transport.send({ type: 'delete-account', name: editing })
    transport.send({ type: 'save-account', profile: { name: account, providers } })
    setFormOpen(false)
    resetForm()
  }

  return (
    <>
      <SettingsPage
        title="Accounts"
        description="Each account is a set of logins, one per agent, kept in a folder of its own. A workspace runs its agents under one of them."
        action={
          <button type="button" className={SETTINGS_PRIMARY} onClick={startNew}>
            <PlusSvg width={14} height={14} />
            Add account
          </button>
        }
      >
        <SettingsGroup
          label={`${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`}
          hint="Point an agent at a folder you already use (~/.claude), or a new one you sign in to from a workspace."
        >
          {accountRows.length === 0 && (
            <div className="px-4 py-6 text-center text-[12.5px] text-[var(--soromi-text-faint)]">
              No accounts yet. Add one to run agents under a login of their own.
            </div>
          )}
          {accountRows.map((account) => (
            <div key={account.name} className="group flex items-start gap-3 px-4 py-3">
              <span className="mt-px flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-[var(--soromi-accent-dim)] font-semibold text-[12px] text-[var(--soromi-accent)]">
                {account.initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex h-7 items-center font-medium text-[13px] text-[var(--soromi-text)]">
                  {account.name}
                </div>
                <div className="flex flex-col gap-1 pb-0.5">
                  {account.providers.map((entry) => (
                    <div key={entry.provider} className="flex min-w-0 items-center gap-2">
                      <span
                        title={entry.connected ? 'Signed in' : 'Not signed in'}
                        className={cn(
                          'h-1.5 w-1.5 flex-none rounded-full',
                          entry.connected
                            ? 'bg-[var(--soromi-accent)]'
                            : 'bg-[var(--soromi-amber)]',
                        )}
                      />
                      <span className="w-12 flex-none text-[12px] text-[var(--soromi-text-dim)]">
                        {entry.label}
                      </span>
                      <span className="min-w-0 truncate text-[11.5px] text-[var(--soromi-text-faint)] [font-family:var(--soromi-font-mono)]">
                        {entry.dir || '(no folder)'}
                      </span>
                      {!entry.connected && (
                        <span className="flex-none text-[11.5px] text-[var(--soromi-amber-text)]">
                          · not signed in
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  title={`Edit ${account.name}`}
                  className={SETTINGS_ICON}
                  onClick={() => startEdit(account)}
                >
                  <PencilSvg width={14} height={14} />
                </button>
                <button
                  type="button"
                  title={`Delete ${account.name}`}
                  className={cn(SETTINGS_ICON, 'hover:text-[var(--soromi-danger-soft)]')}
                  onClick={() => setDeleteTarget(account.name)}
                >
                  <TrashSvg width={14} height={14} />
                </button>
              </div>
            </div>
          ))}
        </SettingsGroup>
      </SettingsPage>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent title={editing ? 'Edit account' : 'New account'} className="max-w-lg">
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
              <Button onClick={save} disabled={!name.trim()}>
                {editing ? 'Save changes' : 'Save account'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    </>
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
