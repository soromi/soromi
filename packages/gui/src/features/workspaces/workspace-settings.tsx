import { Button, Select, Textarea } from '@mantine/core'
import { modals } from '@mantine/modals'
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

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

//Styles
import styles from './workspace-settings.module.css'

//Types
import type { AgentAccount } from '@soromi/protocol'

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
  const { summary, accounts } = useClientStore(
    useShallow((s) => ({
      summary: s.workspaces.find((w) => w.name === workspace),
      accounts: s.accounts,
    })),
  )
  const popOverlay = useAppStore((s) => s.popOverlay)

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

  const accountsChanged = agents.some(
    (agent) => (bindings[agent] ?? 'personal') !== boundAccount(agent),
  )
  const instructionsChanged = instructions.trim() !== (summary?.instructions ?? '').trim()
  const foldersChanged =
    folderPaths.length !== initialFolders.length ||
    folderPaths.some((path) => !initialFolders.includes(path))
  const changed = accountsChanged || instructionsChanged || foldersChanged

  const addFolder = async () => {
    const picked = await pickFolder('Add a work folder')
    if (picked) setFolderPaths((prev) => [...new Set([...prev, picked])])
  }
  const dropFolder = (path: string) =>
    setFolderPaths((prev) => (prev.length > 1 ? prev.filter((p) => p !== path) : prev))

  const discard = () => {
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
      accounts: next,
      folders,
      root,
      instructions: instructions.trim() || undefined,
    })
  }

  const exportSpace = () => transport.send({ type: 'export-space', workspace })
  const removeSpace = () =>
    modals.openConfirmModal({
      title: 'Remove workspace',
      children: <span>Remove "{workspace}"? This stops its agents.</span>,
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        transport.send({ type: 'remove-space', workspace })
        popOverlay()
      },
    })

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
      <div className={styles.body}>
        {SHOW_NAV && (
          <nav className={styles.nav}>
            <div className={styles.navLabel}>Settings</div>
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={clsx(
                  styles.navItem,
                  active === item.id && styles.navActive,
                  item.danger && styles.navDanger,
                )}
                onClick={() => goTo(item.id)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <div ref={contentRef} className={styles.content}>
          <div className={styles.inner}>
            <header className={styles.wsHead}>
              <span className={styles.avatar}>{workspace.charAt(0).toUpperCase()}</span>
              <div>
                <div className={styles.wsName}>{workspace}</div>
                <div className={styles.wsMeta}>
                  {folderPaths.length} {folderPaths.length === 1 ? 'folder' : 'folders'} ·{' '}
                  {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
                </div>
              </div>
            </header>

            <section data-sec="folders">
              <div className={styles.sectionHead}>
                <h2 className={styles.h2}>Folders</h2>
              </div>
              <div className={styles.card}>
                {folderPaths.map((path) => (
                  <div key={path} className={styles.folderRow}>
                    <div className={styles.folderText}>
                      <span className={styles.mono}>{basename(path)}</span>
                      <span className={styles.folderPath} title={path}>
                        {path}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={clsx(styles.rowAction, styles.danger)}
                      disabled={folderPaths.length <= 1}
                      onClick={() => dropFolder(path)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.addRow} onClick={addFolder}>
                  <FolderIcon /> Add folder…
                </button>
              </div>
              <p className={styles.help}>
                Adding or removing folders relaunches this workspace's tabs so agents pick up the
                new paths.
              </p>
            </section>

            <section data-sec="agents">
              <div className={styles.sectionHead}>
                <h2 className={styles.h2}>Agent accounts</h2>
              </div>
              <div className={styles.agents}>
                {agentRows.map((row) => (
                  <div key={row.agent} className={styles.agentRow}>
                    <span className={styles.agentName}>
                      <ProviderIcon provider={row.agent} size={16} />
                      {row.label}
                    </span>
                    <Select
                      flex={1}
                      data={row.options}
                      value={row.value}
                      onChange={(value) =>
                        value && setBindings((prev) => ({ ...prev, [row.agent]: value }))
                      }
                      allowDeselect={false}
                      styles={{
                        input: {
                          background: 'var(--soromi-bg-tab)',
                          borderColor: 'var(--soromi-border)',
                          borderRadius: 10,
                          color: 'var(--soromi-text)',
                        },
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className={styles.help}>
                Each agent runs under the chosen account. Changing one relaunches its tabs.
              </p>
            </section>

            <section data-sec="instructions">
              <div className={styles.sectionHead}>
                <h2 className={styles.h2}>Instructions</h2>
              </div>
              <p className={styles.help} style={{ marginTop: 0, marginBottom: 11 }}>
                Appended to the agent's system prompt. Applies to new tabs (Claude only, for now).
              </p>
              <Textarea
                autosize
                minRows={5}
                maxRows={14}
                placeholder="e.g. This is a monorepo. Prefer pnpm. Never edit generated files."
                value={instructions}
                onChange={(event) => setInstructions(event.currentTarget.value)}
              />
            </section>

            <section data-sec="danger">
              <div className={styles.divider} />
              <div className={styles.dangerRow}>
                <Button variant="default" onClick={exportSpace}>
                  Export <span className={styles.mono}>soromi.space.json</span>
                </Button>
                <Button variant="subtle" color="red" onClick={removeSpace}>
                  Remove workspace
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {changed && (
        <div className={styles.saveBar}>
          <span className={styles.unsaved}>
            <span className={styles.dot} />
            Unsaved changes
          </span>
          <div className={styles.saveActions}>
            <Button variant="default" onClick={discard}>
              Discard
            </Button>
            <Button onClick={save}>Save changes</Button>
          </div>
        </div>
      )}
    </OverlayShell>
  )
}
