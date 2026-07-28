import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { pickFolder } from '@/lib/host'
import { basename, deriveRootAndFolders } from './folders'

//Constants
import { isTauri } from '@/config'
import { PROVIDERS } from '@/config/providers'

//Components
import { OverlayShell } from '@/shared/overlay-shell'
import { ProviderIcon } from '@/shared/provider-icon'

/** The create-space form: pick work folders, choose an agent and account. */
function CreateSpaceForm({ heading }: { heading?: boolean }) {
  const transport = useTransport()
  const { error, setError, openSettings } = useAppStore(
    useShallow((s) => ({ error: s.error, setError: s.setError, openSettings: s.openSettings })),
  )
  const accounts = useClientStore((s) => s.accounts)
  const [folderInputs, setFolderInputs] = useState<string[]>([''])
  const [name, setName] = useState('')
  const [agent, setAgent] = useState('claude')
  const [account, setAccount] = useState('personal')

  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  const { root, folders } = useMemo(() => deriveRootAndFolders(folderInputs), [folderInputs])

  // Only accounts with a login configured for the chosen agent's provider, plus `personal`.
  const accountOptions = useMemo(
    () => [
      ...new Set(['personal', ...accounts.filter((a) => agent in a.providers).map((a) => a.name)]),
    ],
    [accounts, agent],
  )

  const updateFolder = (index: number, value: string) =>
    setFolderInputs((rows) => rows.map((row, i) => (i === index ? value : row)))
  const addFolder = () => setFolderInputs((rows) => [...rows, ''])
  const removeFolder = (index: number) =>
    setFolderInputs((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : ['']))

  const pickFolderAt = async (index: number) => {
    const selected = await pickFolder('Pick a work folder')
    if (selected) updateFolder(index, selected)
  }

  const create = () => {
    if (!root) return
    setError(null)
    const isWhole = folders.length === 1 && folders[0] === '.'
    transport.send({
      type: 'create-space',
      name: name.trim() || basename(root),
      root,
      agent: agent.trim() || 'claude',
      account: account.trim() || 'personal',
      folders: isWhole ? undefined : folders,
    })
  }

  const importFile = () => {
    if (!root) return
    setError(null)
    transport.send({ type: 'open-workspace', dir: root })
  }

  const agentLabel = PROVIDERS.find((p) => p.value === agent)?.label ?? agent

  return (
    <div className="flex w-[460px] flex-col gap-4 p-6">
      {heading && <h2 className="text-lg font-semibold text-foreground">New workspace</h2>}
      <p className="text-sm text-muted-foreground">
        Pick one or more work folders and choose an agent and account. Nothing is written to the
        folder.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ws-name">Name</Label>
        <Input
          id="ws-name"
          placeholder={root ? basename(root) : 'workspace name'}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div>
        <Label className="mb-1.5 block">Folders</Label>
        <div className="flex flex-col gap-2">
          {folderInputs.map((folder, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and stable.
            <div key={index} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder="/path/to/folder"
                value={folder}
                onChange={(event) => updateFolder(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') create()
                }}
              />
              {isTauri && (
                <Button variant="secondary" size="sm" onClick={() => pickFolderAt(index)}>
                  Pick
                </Button>
              )}
              {folderInputs.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove folder"
                  onClick={() => removeFolder(index)}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
          <div>
            <Button variant="ghost" size="sm" onClick={addFolder}>
              Add folder
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 items-start gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Agent</Label>
          <Select value={agent} onValueChange={(value) => value && setAgent(value)}>
            <SelectTrigger>
              <SelectValue>
                <ProviderIcon provider={agent} />
                {agentLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((provider) => (
                <SelectItem key={provider.value} value={provider.value}>
                  <ProviderIcon provider={provider.value} />
                  {provider.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex w-full items-baseline justify-between gap-3">
            <Label>Account</Label>
            <button
              type="button"
              className="appearance-none border-0 bg-transparent text-sm text-primary hover:underline"
              onClick={openSettings}
            >
              New account
            </button>
          </div>
          <Select value={account} onValueChange={(value) => value && setAccount(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button onClick={create} disabled={!root}>
        Create workspace
      </Button>
      <Button variant="ghost" size="sm" onClick={importFile} disabled={!root}>
        Import a soromi.space.json from this folder
      </Button>
    </div>
  )
}

/** Base view shown when there is no active workspace (first run). */
export function Welcome() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <CreateSpaceForm heading />
    </div>
  )
}

/** Create-space as an overlay on top of a running workspace. */
export function CreateSpaceOverlay() {
  return (
    <OverlayShell title="New workspace">
      <div className="flex flex-1 items-center justify-center">
        <CreateSpaceForm />
      </div>
    </OverlayShell>
  )
}
