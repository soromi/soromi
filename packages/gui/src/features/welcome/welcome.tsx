import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { pickFolder } from '@/lib/host'
import { basename, deriveRootAndFolders } from './folders'

//Constants
import { isDesktop } from '@/config'
import { PROVIDERS } from '@/config/providers'

//Components
import { OverlayShell } from '@/shared/overlay-shell'
import { ProviderIcon } from '@/shared/provider-icon'

/** Bold field label. */
const LABEL = 'font-semibold text-[13.5px] text-[var(--soromi-text)]'
/** A text input field. */
const FIELD =
  'w-full rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-[14px] py-[11px] text-[14px] text-[var(--soromi-text)] outline-none transition-colors placeholder:text-[var(--soromi-text-faint)] focus:border-[var(--soromi-accent)]'
/** A dropdown trigger, matched to the fields. */
const TRIGGER =
  'h-auto rounded-[10px] border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-[13px] py-[11px] text-[14px]'

const FolderIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

/** The create-space form: pick work folders, choose an agent and account. */
function CreateSpaceForm() {
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
    <div className="flex w-full flex-col gap-6">
      <p className="m-0 text-[14px] text-[var(--soromi-text-dim)] leading-[1.5]">
        Pick one or more work folders and choose an agent and account. Nothing is written to the
        folder.
      </p>

      <div className="flex flex-col gap-2">
        <label className={LABEL} htmlFor="ws-name">
          Name
        </label>
        <input
          id="ws-name"
          className={FIELD}
          placeholder={root ? basename(root) : 'workspace name'}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className={LABEL}>Folders</span>
        {folderInputs.map((folder, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and stable.
          <div key={index} className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <span className="-translate-y-1/2 absolute top-1/2 left-[13px] text-[var(--soromi-text-faint)]">
                <FolderIcon />
              </span>
              <input
                className={cn(FIELD, 'pl-[38px] text-[13px] [font-family:var(--soromi-font-mono)]')}
                placeholder="/path/to/folder"
                value={folder}
                onChange={(event) => updateFolder(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') create()
                }}
              />
            </div>
            {isDesktop && (
              <button
                type="button"
                onClick={() => pickFolderAt(index)}
                className="flex-none cursor-pointer appearance-none rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-hover)] px-5 py-[11px] font-semibold text-[14px] text-[var(--soromi-text-dim)] transition-colors hover:bg-[var(--soromi-bg-active)]"
              >
                Pick
              </button>
            )}
            {folderInputs.length > 1 && (
              <button
                type="button"
                aria-label="Remove folder"
                onClick={() => removeFolder(index)}
                className="flex h-[38px] w-[30px] flex-none cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:text-[var(--soromi-text-dim)]"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addFolder}
          className="inline-flex cursor-pointer appearance-none items-center gap-[7px] self-start border-none bg-transparent font-semibold text-[14px] text-[var(--soromi-accent)] hover:underline"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add folder
        </button>
      </div>

      <div className="h-px bg-[var(--soromi-border)]" />

      <div className="grid grid-cols-2 gap-5">
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Agent</span>
          <Select value={agent} onValueChange={(value) => value && setAgent(value)}>
            <SelectTrigger className={TRIGGER}>
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
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className={LABEL}>Account</span>
            <button
              type="button"
              className="cursor-pointer appearance-none border-none bg-transparent font-semibold text-[13px] text-[var(--soromi-accent)] hover:underline"
              onClick={openSettings}
            >
              New account
            </button>
          </div>
          <Select value={account} onValueChange={(value) => value && setAccount(value)}>
            <SelectTrigger className={TRIGGER}>
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
        <div className="rounded-[10px] border border-[rgb(224_133_133/0.4)] bg-[rgb(224_133_133/0.08)] px-3.5 py-2.5 text-[13px] text-[#e08585]">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={create}
        disabled={!root}
        className="w-full cursor-pointer appearance-none rounded-[12px] border-none bg-[var(--soromi-accent)] py-[15px] font-bold text-[15px] text-[var(--soromi-accent-on)] transition-colors hover:bg-[#4bdb9a] disabled:cursor-not-allowed disabled:opacity-[0.45]"
      >
        Create workspace
      </button>
      <button
        type="button"
        onClick={importFile}
        disabled={!root}
        className="cursor-pointer appearance-none border-none bg-transparent text-center font-semibold text-[14px] text-[var(--soromi-accent)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--soromi-text-faint)] disabled:no-underline"
      >
        Import a <span className="[font-family:var(--soromi-font-mono)]">soromi.space.json</span>{' '}
        from this folder
      </button>
    </div>
  )
}

/** Base view shown when there is no active workspace (first run). */
export function Welcome() {
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto px-8 py-10">
      <div className="w-full max-w-[900px]">
        <CreateSpaceForm />
      </div>
    </div>
  )
}

/** Create-space as an overlay on top of a running workspace. */
export function CreateSpaceOverlay() {
  return (
    <OverlayShell icon={<FolderIcon size={18} />} title="New workspace">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[900px] px-8 pt-12 pb-20">
          <CreateSpaceForm />
        </div>
      </div>
    </OverlayShell>
  )
}
