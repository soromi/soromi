import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import {
  Button,
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
import { basename, deriveRootAndFolders } from '@/features/welcome/folders'
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
  'overflow-hidden rounded-[13px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)]'
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

// Hidden for now: with these few short sections the scroll-spy nav reads awkwardly. Flip to true
// to bring the section nav back once there are more (and longer) sections.
const SHOW_NAV = false

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
  const boundAccount = (agent: string) =>
    summary?.accounts.find((a) => a.agent === agent)?.id ?? 'personal'
  const initialFolders = useMemo(() => {
    const root = summary?.root ?? ''
    return (summary?.folders ?? []).map((folder) => (folder === '.' ? root : `${root}/${folder}`))
  }, [summary])

  const [bindings, setBindings] = useState<Record<string, string>>(() =>
    Object.fromEntries(agents.map((agent) => [agent, boundAccount(agent)])),
  )
  const [name, setName] = useState(workspace)
  const [instructions, setInstructions] = useState(summary?.instructions ?? '')
  const [folderPaths, setFolderPaths] = useState<string[]>(initialFolders)

  // Prepare each agent's row (label, account options, current value) once, so the JSX only renders.
  const agentRows = useMemo(
    () =>
      agents.map((agent) => ({
        agent,
        label: PROVIDERS.find((p) => p.value === agent)?.label ?? agent,
        value: bindings[agent] ?? 'personal',
        options: [
          ...new Set([
            'personal',
            ...accounts.filter((a) => agent in a.providers).map((a) => a.name),
            ...(bindings[agent] ? [bindings[agent]] : []),
          ]),
        ].map((name) => ({ value: name, label: name })),
      })),
    [agents, accounts, bindings],
  )

  const nameChanged = name.trim() !== '' && name.trim() !== workspace
  const accountsChanged = agents.some(
    (agent) => (bindings[agent] ?? 'personal') !== boundAccount(agent),
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
    setBindings(Object.fromEntries(agents.map((agent) => [agent, boundAccount(agent)])))
    setInstructions(summary?.instructions ?? '')
    setFolderPaths(initialFolders)
  }
  const save = () => {
    const next: AgentAccount[] = agents.map((agent) => ({
      id: bindings[agent] ?? 'personal',
      agent,
    }))
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
    <OverlayShell title="Workspace settings">
      <div className="flex min-h-0 flex-1">
        {SHOW_NAV && (
          <nav className="flex w-[212px] flex-none flex-col gap-[3px] border-[var(--soromi-border-subtle)] border-r px-3.5 py-6">
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
                    'flex cursor-pointer appearance-none items-center gap-[11px] rounded-[9px] border-none bg-transparent px-3 py-[9px] text-left font-medium text-[13.5px] text-[var(--soromi-text-dim)] transition-colors hover:bg-[var(--soromi-bg-hover)]',
                    isActive && 'bg-[var(--soromi-bg-active)] text-[var(--soromi-text)]',
                    item.danger && isActive && 'text-[#e08585]',
                  )}
                  onClick={() => goTo(item.id)}
                >
                  <span
                    className={cn(
                      'flex h-[18px] w-[18px] flex-none items-center justify-center text-[var(--soromi-text-faint)]',
                      isActive && 'text-[var(--soromi-accent)]',
                      item.danger && isActive && 'text-[#e08585]',
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              )
            })}
          </nav>
        )}

        <div ref={contentRef} className="flex-1 overflow-y-auto">
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
                      className="flex-none cursor-pointer appearance-none rounded-lg border-none bg-transparent px-2.5 py-[5px] font-medium text-[#e08585] text-[12.5px] transition-colors enabled:hover:bg-[var(--soromi-bg-hover)] disabled:cursor-default disabled:opacity-35"
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
                    className="flex items-center gap-4 rounded-[13px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)] px-4 py-3"
                  >
                    <span className="flex w-[130px] flex-none items-center gap-[11px] text-[var(--soromi-text)] text-sm">
                      <ProviderIcon provider={row.agent} size={16} />
                      {row.label}
                    </span>
                    <Select
                      value={row.value}
                      onValueChange={(value) =>
                        value && setBindings((prev) => ({ ...prev, [row.agent]: value }))
                      }
                    >
                      <SelectTrigger className="flex-1 rounded-[10px] bg-[var(--soromi-bg-tab)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {row.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <p className={HELP}>
                Each agent runs under the chosen account. Changing one relaunches its tabs.
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
              <div className="mt-[38px] mb-6 h-px bg-[var(--soromi-border-subtle)]" />
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={exportSpace}>
                  Export <span className={MONO}>soromi.space.json</span>
                </Button>
                <Button variant="ghost" className="text-destructive" onClick={removeSpace}>
                  Remove workspace
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {changed && (
        <div className="flex flex-none items-center justify-between gap-4 border-[var(--soromi-border)] border-t bg-[var(--soromi-bg-app)] px-[26px] py-3.5">
          <span className="flex items-center gap-[9px] text-[13px] text-[var(--soromi-text-dim)]">
            <span className="h-2 w-2 rounded-full bg-[var(--soromi-warn)]" />
            Unsaved changes
          </span>
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={discard}>
              Discard
            </Button>
            <Button onClick={save}>Save changes</Button>
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
