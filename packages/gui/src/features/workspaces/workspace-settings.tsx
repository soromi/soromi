import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import {
  ConfirmDialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
} from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { basename, deriveRootAndFolders } from '@soromi/client'
import { pickFolder } from '@/lib/host'

//Constants
import { PROVIDERS } from '@/config/providers'

//Components
import { OverlayShell } from '@/shared/overlay-shell'
import { ProviderIcon } from '@/shared/provider-icon'
import { FolderIcon, InstructionsIcon, UsersIcon, WarningIcon } from './settings-icons'

//Types
import type { AgentAccount } from '@soromi/protocol'

/** A section title (small uppercase label). */
const H2 =
  'm-0 font-semibold text-[13px] text-[var(--soromi-text-faint)] uppercase tracking-[0.09em]'
/** The section header row. */
const SECTION_HEAD = 'mt-9 mb-3 flex items-baseline justify-between'
/** A bordered content card. */
const CARD =
  'overflow-hidden rounded-[14px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)]'
/** A row inside a card (folder / notification). */
const FOLDER_ROW =
  'flex items-center justify-between gap-3 border-[var(--soromi-border-subtle)] border-b px-4 py-[13px]'
/** Truncating monospace text (folder names, the export filename). */
const MONO =
  'overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[var(--soromi-text-dim)] [font-family:var(--soromi-font-mono)]'
/** The secondary caption under a row / section. */
const FOLDER_PATH =
  'overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-[var(--soromi-text-faint)]'
/** The muted help paragraph. */
const HELP = 'mt-[11px] mb-0 text-[12.5px] text-[var(--soromi-text-faint)] leading-[1.55]'

const NAV = [
  { id: 'folders', label: 'Folders', icon: <FolderIcon /> },
  { id: 'agents', label: 'Agent accounts', icon: <UsersIcon /> },
  { id: 'instructions', label: 'Instructions', icon: <InstructionsIcon /> },
  { id: 'danger', label: 'Danger zone', icon: <WarningIcon />, danger: true },
]

/** Full-page workspace settings: section nav, folders, agent accounts, instructions, danger zone. */
export function WorkspaceSettings({ workspace }: { workspace: string }) {
  const transport = useTransport()
  const { summary, accounts, muted, setMuted } = useClientStore(
    useShallow((s) => ({
      summary: s.workspaces.find((w) => w.name === workspace),
      accounts: s.accounts,
      muted: s.muted,
      setMuted: s.setMuted,
    })),
  )
  const popOverlay = useAppStore((s) => s.popOverlay)

  const notificationsOn = !(muted[workspace] ?? false)
  const setNotifications = (on: boolean) => {
    setMuted(workspace, !on)
    transport.send({ type: 'mute-workspace', workspace, muted: !on })
  }

  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  const agents = useMemo(
    () => [
      ...new Set([
        ...PROVIDERS.map((p) => p.value),
        ...(summary?.accounts.map((a) => a.agent) ?? []),
      ]),
    ],
    [summary],
  )
  // The accounts the workspace binds to an agent, in order: its tabs run under the first, and a tab
  // can be moved to any of the others. An agent bound to none shows the default account.
  const boundAccounts = (agent: string) => {
    const bound = summary?.accounts.filter((a) => a.agent === agent).map((a) => a.id) ?? []
    return bound.length > 0 ? bound : ['personal']
  }
  const initialFolders = useMemo(() => {
    const root = summary?.root ?? ''
    return (summary?.folders ?? []).map((folder) => (folder === '.' ? root : `${root}/${folder}`))
  }, [summary])

  const [bindings, setBindings] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(agents.map((agent) => [agent, boundAccounts(agent)])),
  )
  const [name, setName] = useState(workspace)
  const [instructions, setInstructions] = useState(summary?.instructions ?? '')
  const [folderPaths, setFolderPaths] = useState<string[]>(initialFolders)

  // Prepare each agent's row (label, its accounts, the ones it could add) once, so the JSX only
  // renders.
  const agentRows = useMemo(
    () =>
      agents.map((agent) => {
        const chosen = bindings[agent] ?? ['personal']
        const names = [
          ...new Set([
            'personal',
            ...accounts.filter((a) => agent in a.providers).map((a) => a.name),
            ...chosen,
          ]),
        ]
        return {
          agent,
          label: PROVIDERS.find((p) => p.value === agent)?.label ?? agent,
          chosen,
          options: names.map((name) => ({ value: name, label: name })),
          // Another account can be added while one that configures the agent is left over.
          spare: accounts
            .filter((a) => agent in a.providers)
            .map((a) => a.name)
            .filter((name) => !chosen.includes(name)),
        }
      }),
    [agents, accounts, bindings],
  )
  const setAccount = (agent: string, index: number, account: string) =>
    setBindings((prev) => {
      const list = [...(prev[agent] ?? ['personal'])]
      list[index] = account
      return { ...prev, [agent]: [...new Set(list)] }
    })
  const addAccount = (agent: string, account: string) =>
    setBindings((prev) => ({ ...prev, [agent]: [...(prev[agent] ?? []), account] }))
  const dropAccount = (agent: string, index: number) =>
    setBindings((prev) => ({
      ...prev,
      [agent]: (prev[agent] ?? []).filter((_, at) => at !== index),
    }))

  const nameChanged = name.trim() !== '' && name.trim() !== workspace
  const accountsChanged = agents.some(
    (agent) => (bindings[agent] ?? ['personal']).join('\n') !== boundAccounts(agent).join('\n'),
  )
  const instructionsChanged = instructions.trim() !== (summary?.instructions ?? '').trim()
  const foldersChanged =
    folderPaths.length !== initialFolders.length ||
    folderPaths.some((path) => !initialFolders.includes(path))
  const changed = nameChanged || accountsChanged || instructionsChanged || foldersChanged

  const addFolder = async () => {
    const picked = await pickFolder('Add a work folder')
    if (picked) setFolderPaths((prev) => [...new Set([...prev, picked])])
  }
  const dropFolder = (path: string) =>
    setFolderPaths((prev) => (prev.length > 1 ? prev.filter((p) => p !== path) : prev))

  const discard = () => {
    setName(workspace)
    setBindings(Object.fromEntries(agents.map((agent) => [agent, boundAccounts(agent)])))
    setInstructions(summary?.instructions ?? '')
    setFolderPaths(initialFolders)
  }
  const save = () => {
    // Only persist real bindings: an agent whose selected account actually configures that provider.
    // The rows default every unconfigured provider to "personal"; without this filter, saving any
    // change (a folder, the name) would bind every provider to a phantom account it can't run under.
    const next: AgentAccount[] = agents
      .flatMap((agent) => (bindings[agent] ?? ['personal']).map((id) => ({ id, agent })))
      .filter((b) => accounts.find((a) => a.name === b.id)?.providers?.[b.agent] != null)
    const { root, folders } = deriveRootAndFolders(folderPaths)

    transport.send({
      type: 'update-space',
      workspace,
      name: nameChanged ? name.trim() : undefined,
      accounts: next,
      folders,
      root,
      instructions: instructions.trim() || undefined,
    })
  }

  const [removeOpen, setRemoveOpen] = useState(false)
  const exportSpace = () => transport.send({ type: 'export-space', workspace })
  const removeSpace = () => setRemoveOpen(true)

  // Highlight the nav item for the section currently near the top of the scroll area.
  const contentRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('folders')

  useEffect(() => {
    const root = contentRef.current
    if (!root) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        )
        setActive(top.target.getAttribute('data-sec') ?? 'folders')
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    )
    for (const section of root.querySelectorAll('[data-sec]')) observer.observe(section)

    return () => observer.disconnect()
  }, [])

  const goTo = (id: string) =>
    contentRef.current
      ?.querySelector(`[data-sec="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <OverlayShell title={workspace}>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[212px] flex-none flex-col gap-[3px] px-3.5 py-5">
          <div className="px-3 pb-2.5 font-semibold text-[11px] text-[var(--soromi-text-faint)] uppercase tracking-[0.1em]">
            Settings
          </div>
          {NAV.map((item) => {
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'flex cursor-pointer appearance-none items-center gap-[11px] rounded-[9px] border-none bg-transparent px-3 py-[9px] text-left font-medium text-[13.5px] transition-colors',
                  isActive
                    ? item.danger
                      ? 'bg-[var(--soromi-bg-hover)] text-[var(--soromi-danger-soft)]'
                      : 'bg-[var(--soromi-bg-hover)] text-[var(--soromi-text)]'
                    : 'text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]',
                )}
                onClick={() => goTo(item.id)}
              >
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] flex-none items-center justify-center',
                    isActive
                      ? item.danger
                        ? 'text-[var(--soromi-danger-soft)]'
                        : 'text-[var(--soromi-accent)]'
                      : 'text-[var(--soromi-text-faint)]',
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div
          ref={contentRef}
          className="mr-2 mb-2 flex-1 overflow-y-auto rounded-[12px] border border-[var(--soromi-border-subtle)] bg-[var(--soromi-bg-terminal)] [box-shadow:var(--soromi-shadow-panel)]"
        >
          <div className="mx-auto max-w-[720px] px-7 pt-10 pb-14">
            <header className="flex items-center gap-3.5">
              <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl bg-[var(--soromi-accent)] font-bold text-[var(--soromi-accent-on)] text-base">
                {workspace.charAt(0).toUpperCase()}
              </span>
              <div>
                <div className="font-semibold text-[var(--soromi-text)] text-lg">{workspace}</div>
                <div className="mt-[3px] text-[13px] text-[var(--soromi-text-faint)]">
                  {folderPaths.length} {folderPaths.length === 1 ? 'folder' : 'folders'} ·{' '}
                  {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
                </div>
              </div>
            </header>

            <section data-sec="name">
              <div className={SECTION_HEAD}>
                <h2 className={H2}>Name</h2>
              </div>
              <Input
                className="rounded-[10px] bg-[var(--soromi-bg-tab)]"
                value={name}
                placeholder="Workspace name"
                onChange={(event) => setName(event.target.value)}
              />
            </section>

            <section data-sec="folders">
              <div className={SECTION_HEAD}>
                <h2 className={H2}>Folders</h2>
              </div>
              <div className={CARD}>
                {folderPaths.map((path) => (
                  <div key={path} className={FOLDER_ROW}>
                    <div className="flex min-w-0 flex-col gap-[3px]">
                      <span className={MONO}>{basename(path)}</span>
                      <span className={FOLDER_PATH} title={path}>
                        {path}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="flex-none cursor-pointer appearance-none rounded-lg border-none bg-transparent px-2.5 py-[5px] font-medium text-[var(--soromi-danger-soft)] text-[12.5px] transition-colors enabled:hover:bg-[var(--soromi-bg-hover)] disabled:cursor-default disabled:opacity-35"
                      disabled={folderPaths.length <= 1}
                      onClick={() => dropFolder(path)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="flex w-full cursor-pointer appearance-none items-center gap-[9px] border-none bg-transparent px-4 py-[13px] font-semibold text-[13.5px] text-[var(--soromi-accent)] hover:bg-[var(--soromi-bg-hover)]"
                  onClick={addFolder}
                >
                  <FolderIcon /> Add folder…
                </button>
              </div>
              <p className={HELP}>
                Adding or removing folders relaunches this workspace's tabs so agents pick up the
                new paths.
              </p>
            </section>

            <section data-sec="agents">
              <div className={SECTION_HEAD}>
                <h2 className={H2}>Agent accounts</h2>
              </div>
              <div className="flex flex-col gap-3">
                {agentRows.map((row) => (
                  <div
                    key={row.agent}
                    className="flex items-start gap-4 rounded-[13px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)] px-4 py-3"
                  >
                    <span className="flex h-9 w-[130px] flex-none items-center gap-[11px] text-[var(--soromi-text)] text-sm">
                      <ProviderIcon provider={row.agent} size={16} />
                      {row.label}
                    </span>
                    <div className="flex flex-col gap-2">
                      {row.chosen.map((account, index) => (
                        <div key={account} className="flex items-center gap-2">
                          <Select
                            value={account}
                            onValueChange={(value) => value && setAccount(row.agent, index, value)}
                          >
                            <SelectTrigger className="w-[200px] flex-none rounded-[9px] bg-[var(--soromi-bg-field)]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {row.options
                                .filter(
                                  (option) =>
                                    option.value === account || !row.chosen.includes(option.value),
                                )
                                .map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          {index === 0 ? (
                            row.chosen.length > 1 && (
                              <span className="text-[11px] text-[var(--soromi-text-faint)]">
                                Default
                              </span>
                            )
                          ) : (
                            <button
                              type="button"
                              title="Remove this account"
                              onClick={() => dropAccount(row.agent, index)}
                              className="flex h-[26px] w-[26px] cursor-pointer appearance-none items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                aria-hidden="true"
                              >
                                <path d="M6 6l12 12M18 6L6 18" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {row.spare.length > 0 && (
                        <button
                          type="button"
                          onClick={() => addAccount(row.agent, row.spare[0])}
                          className="flex w-fit cursor-pointer appearance-none items-center gap-1.5 rounded-md border-none bg-transparent px-1 py-0.5 text-[12px] text-[var(--soromi-text-faint)] hover:text-[var(--soromi-text-dim)]"
                        >
                          + Add another account
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className={HELP}>
                New tabs run under an agent's default account. With more than one, each session can
                be moved to another from its composer, or started under one from New session.
                Changing the default relaunches the tabs that follow it.
              </p>
            </section>

            <section data-sec="instructions">
              <div className={SECTION_HEAD}>
                <h2 className={H2}>Instructions</h2>
              </div>
              <p className={HELP} style={{ marginTop: 0, marginBottom: 11 }}>
                Appended to the agent's system prompt. Applies to new tabs (Claude only, for now).
              </p>
              <Textarea
                className="min-h-[120px]"
                rows={6}
                placeholder="e.g. This is a monorepo. Prefer pnpm. Never edit generated files."
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </section>

            <section data-sec="notifications">
              <div className={SECTION_HEAD}>
                <h2 className={H2}>Notifications</h2>
              </div>
              <div className={CARD}>
                <div className={FOLDER_ROW}>
                  <div className="flex min-w-0 flex-col gap-[3px]">
                    <span>Desktop notifications</span>
                    <span className={FOLDER_PATH}>
                      Play a sound and show a banner when this workspace needs you (while the app is
                      in the background).
                    </span>
                  </div>
                  <Switch checked={notificationsOn} onCheckedChange={setNotifications} />
                </div>
              </div>
            </section>

            <section data-sec="danger">
              <div className={SECTION_HEAD}>
                <h2 className={H2}>Danger zone</h2>
              </div>
              <div className="overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--soromi-danger-soft)_28%,transparent)] bg-[color-mix(in_srgb,var(--soromi-danger-soft)_5%,transparent)]">
                <div className="flex items-center justify-between gap-4 border-[color-mix(in_srgb,var(--soromi-danger-soft)_18%,transparent)] border-b px-[18px] py-4">
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-[var(--soromi-text-dim)]">
                      Export workspace
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[var(--soromi-text-faint)]">
                      Write <span className={MONO}>soromi.space.json</span> to the workspace root.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={exportSpace}
                    className="flex-none cursor-pointer appearance-none rounded-[9px] border border-[color-mix(in_srgb,var(--soromi-danger-soft)_40%,transparent)] bg-transparent px-[15px] py-[9px] font-semibold text-[13px] text-[var(--soromi-danger-soft)] transition-colors hover:bg-[color-mix(in_srgb,var(--soromi-danger-soft)_12%,transparent)]"
                  >
                    Export
                  </button>
                </div>
                <div className="flex items-center justify-between gap-4 px-[18px] py-4">
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-[var(--soromi-text-dim)]">
                      Delete workspace
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[var(--soromi-text-faint)]">
                      Removes it and stops its agents. This can't be undone.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeSpace}
                    className="flex-none cursor-pointer appearance-none rounded-[9px] border-none bg-[var(--soromi-danger-soft)] px-[15px] py-[9px] font-bold text-[13px] text-[var(--soromi-danger-on)] hover:bg-[var(--soromi-danger-hover)]"
                  >
                    Delete…
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {changed && (
        <div className="flex h-[64px] flex-none items-center justify-between gap-4 border-[var(--soromi-border-subtle)] border-t bg-[var(--soromi-bg-app)] px-[26px]">
          <span className="flex items-center gap-[9px] text-[13px] text-[var(--soromi-text-dim)]">
            <span className="h-[7px] w-[7px] rounded-full bg-[var(--soromi-amber)]" />
            Unsaved changes
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={discard}
              className="cursor-pointer appearance-none rounded-[10px] border border-[var(--soromi-border-strong)] bg-transparent px-[18px] py-[10px] font-semibold text-[13.5px] text-[var(--soromi-text-dim)] transition-colors hover:border-[var(--soromi-text-ghost)]"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              className="cursor-pointer appearance-none rounded-[10px] border-none bg-[var(--soromi-accent)] px-[22px] py-[10px] font-bold text-[13.5px] text-[var(--soromi-accent-on)] hover:bg-[var(--soromi-accent-hover)]"
            >
              Save changes
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove workspace"
        destructive
        confirmLabel="Remove"
        onConfirm={() => {
          transport.send({ type: 'remove-space', workspace })
          popOverlay()
          setRemoveOpen(false)
        }}
      >
        Remove "{workspace}"? This stops its agents.
      </ConfirmDialog>
    </OverlayShell>
  )
}
