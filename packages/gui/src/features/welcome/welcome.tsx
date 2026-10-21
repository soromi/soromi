import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { pickFolder } from '@/lib/host'
import { basename, deriveRootAndFolders } from '@soromi/client'

//Constants
import { isDesktop } from '@/config'
import { PROVIDERS } from '@/config/providers'

//Components
import { Ambient } from '@/shared/ambient'
import { OverlayShell } from '@/shared/overlay-shell'
import { ProviderIcon } from '@/shared/provider-icon'
import { SoromiMark } from '@/shared/soromi-mark'

//Types
import type { ReactNode } from 'react'

/** A field's label. */
const LABEL = 'font-medium text-[12.5px] text-[var(--soromi-text-dim)]'
/** A text input field. */
const FIELD =
  'h-9 w-full rounded-[8px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-field)] px-3 text-[13px] text-[var(--soromi-text)] outline-none transition-colors placeholder:text-[var(--soromi-text-ghost)] focus:border-[var(--soromi-accent)]'
/** A dropdown trigger, matched to the fields. */
const TRIGGER =
  'h-9 rounded-[8px] border-[var(--soromi-border)] bg-[var(--soromi-bg-field)] px-3 text-[13px]'

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
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-1.5">
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

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Folders</span>
        {folderInputs.map((folder, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and stable.
          <div key={index} className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="-translate-y-1/2 absolute top-1/2 left-[11px] text-[var(--soromi-text-faint)]">
                <FolderIcon size={14} />
              </span>
              <input
                className={cn(
                  FIELD,
                  'pl-[32px] text-[12.5px] [font-family:var(--soromi-font-mono)]',
                )}
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
                className="h-9 flex-none cursor-pointer appearance-none rounded-[8px] border border-[var(--soromi-border)] bg-transparent px-3.5 font-medium text-[12.5px] text-[var(--soromi-text-dim)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]"
              >
                Pick
              </button>
            )}
            {folderInputs.length > 1 && (
              <button
                type="button"
                aria-label="Remove folder"
                onClick={() => removeFolder(index)}
                className="flex h-9 w-[28px] flex-none cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:text-[var(--soromi-text-dim)]"
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
          className="mt-0.5 inline-flex cursor-pointer appearance-none items-center gap-1.5 self-start border-none bg-transparent font-medium text-[12.5px] text-[var(--soromi-accent)] hover:underline"
        >
          <svg
            width="14"
            height="14"
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

      <div className="h-px bg-[var(--soromi-border-subtle)]" />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className={LABEL}>Account</span>
            <button
              type="button"
              className="cursor-pointer appearance-none border-none bg-transparent font-medium text-[12px] text-[var(--soromi-accent)] hover:underline"
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
        <div className="rounded-[8px] border border-[color-mix(in_srgb,var(--soromi-danger-soft)_40%,transparent)] bg-[color-mix(in_srgb,var(--soromi-danger-soft)_8%,transparent)] px-3 py-2 text-[12.5px] text-[var(--soromi-danger-soft)]">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={create}
        disabled={!root}
        className="h-10 w-full cursor-pointer appearance-none rounded-[9px] border-none bg-[var(--soromi-accent)] font-semibold text-[13.5px] text-[var(--soromi-accent-on)] transition-colors hover:bg-[var(--soromi-accent-hover)] disabled:cursor-not-allowed disabled:opacity-[0.45]"
      >
        Create workspace
      </button>
      <button
        type="button"
        onClick={importFile}
        disabled={!root}
        className="-mt-1 cursor-pointer appearance-none border-none bg-transparent text-center font-medium text-[12.5px] text-[var(--soromi-accent)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--soromi-text-faint)] disabled:no-underline"
      >
        Import a <span className="[font-family:var(--soromi-font-mono)]">soromi.space.json</span>{' '}
        from this folder
      </button>
    </div>
  )
}

/**
 * The create-space form on a card of its own, raised over the page's dotted ground: its title (with
 * a mark when there is one), what creating a workspace does, and the form.
 */
function CreateSpaceCard({ title, mark }: { title: string; mark?: ReactNode }) {
  return (
    <div className="relative w-full max-w-[500px] rounded-[16px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)] px-7 pt-7 pb-6 [box-shadow:var(--soromi-shadow-float)]">
      <div className="mb-6 flex items-start gap-3">
        {mark && <span className="mt-[3px] flex flex-none">{mark}</span>}
        <div className="min-w-0">
          <h1 className="m-0 font-semibold text-[18px] text-[var(--soromi-text)] tracking-[-0.01em]">
            {title}
          </h1>
          <p className="m-0 mt-1 text-[12.5px] text-[var(--soromi-text-faint)] leading-[1.5]">
            Pick the folders an agent works in, the agent, and the account it runs under. Nothing is
            written to the folders.
          </p>
        </div>
      </div>
      <CreateSpaceForm />
    </div>
  )
}

/** Base view shown when there is no workspace yet (first run): a welcome, and the way to start. */
export function Welcome() {
  return (
    <div className="relative flex flex-1 flex-col overflow-auto">
      <Ambient focus="center" />
      {/* In the middle of the panel when it has the room, from the top when it does not. */}
      <div className="relative my-auto flex justify-center px-6 py-12">
        <CreateSpaceCard title="Welcome to Soromi" mark={<SoromiMark width={20} height={18} />} />
      </div>
    </div>
  )
}

/** Create-space as an overlay on top of a running workspace. */
export function CreateSpaceOverlay() {
  return (
    <OverlayShell icon={<FolderIcon size={18} />} title="New workspace">
      <div className="relative min-h-0 flex-1 overflow-auto">
        <Ambient focus="top" />
        <div className="relative flex justify-center px-6 pt-14 pb-16">
          <CreateSpaceCard title="New workspace" />
        </div>
      </div>
    </OverlayShell>
  )
}
