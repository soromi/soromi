import clsx from 'clsx'
import { useEffect, useState } from 'react'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import drawer from './drawer.module.css'
import styles from './sidebar-drawer.module.css'

//Types
import type { DirEntry } from '@soromi/protocol'

/** Slide-over Files / Skills panel. Files lists the workspace root; Skills types `/name` in. */
export function SidebarDrawer({ workspace, session }: { workspace?: string; session?: string }) {
  const closeDrawer = useUiStore((s) => s.popOverlay)
  const mode = useUiStore((s) => s.sidebarMode)
  const setMode = useUiStore((s) => s.setSidebarMode)

  return (
    <>
      {/** biome-ignore lint/a11y/noStaticElementInteractions: click-away backdrop. */}
      {/** biome-ignore lint/a11y/useKeyWithClickEvents: click-away backdrop. */}
      <div className={drawer.backdrop} onClick={closeDrawer} />
      <aside className={clsx(drawer.panel, drawer.right)}>
        <div className={drawer.header}>
          <div className={styles.toggle}>
            <button
              type="button"
              className={clsx(styles.tab, mode === 'files' && styles.on)}
              onClick={() => setMode('files')}
            >
              Files
            </button>
            <button
              type="button"
              className={clsx(styles.tab, mode === 'skills' && styles.on)}
              onClick={() => setMode('skills')}
            >
              Skills
            </button>
          </div>
          <button type="button" className={drawer.close} onClick={closeDrawer} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={drawer.body}>
          {mode === 'files' ? (
            <Files workspace={workspace} />
          ) : (
            <Skills session={session} onInsert={closeDrawer} />
          )}
        </div>
      </aside>
    </>
  )
}

/** Flat listing of the workspace root, fetched on open. */
function Files({ workspace }: { workspace?: string }) {
  const transport = useTransport()
  const [entries, setEntries] = useState<DirEntry[] | null>(null)

  useEffect(() => {
    if (!workspace) return
    const off = transport.onMessage((message) => {
      if (message.type === 'dir-listing' && message.workspace === workspace && message.path === '')
        setEntries(message.entries)
    })
    transport.send({ type: 'list-dir', workspace, path: '' })
    return off
  }, [workspace, transport])

  if (!workspace) return <div className={styles.empty}>No workspace</div>
  if (entries === null) return <div className={styles.empty}>Loading…</div>

  return (
    <>
      {entries.map((entry) => (
        <div key={entry.name} className={clsx(styles.entry, entry.ignored && styles.ignored)}>
          <span className={styles.entryIcon}>{entry.type === 'dir' ? '▸' : ''}</span>
          <span className={styles.entryName}>{entry.name}</span>
        </div>
      ))}
    </>
  )
}

/** The session's slash commands and skills; tap one to type `/name ` into the terminal. */
function Skills({ session, onInsert }: { session?: string; onInsert: () => void }) {
  const transport = useTransport()
  const skills = useClientStore((s) => (session ? s.skills[session] : undefined))

  useEffect(() => {
    if (session) transport.send({ type: 'list-skills', session })
  }, [session, transport])

  if (!session) return <div className={styles.empty}>No session</div>
  if (skills === undefined) return <div className={styles.empty}>Loading…</div>

  const insert = (name: string) => {
    transport.send({ type: 'input', session, data: `/${name} ` })
    onInsert()
  }

  return (
    <>
      {skills.map((skill) => (
        <button
          key={`${skill.kind}:${skill.scope}:${skill.name}`}
          type="button"
          className={styles.skill}
          onClick={() => insert(skill.name)}
        >
          <span className={styles.skillName}>/{skill.name}</span>
          {skill.description && <span className={styles.skillDesc}>{skill.description}</span>}
        </button>
      ))}
    </>
  )
}
