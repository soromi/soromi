import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Styles
import styles from './skill-list.module.css'

/** A human title from a command name: `code-review` -> `Code review`. */
function humanize(name: string): string {
  const spaced = name.replace(/[-_]/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/**
 * The active session's slash commands and skills. Clicking one types `/name ` into the terminal
 * (it does not run), so you can add arguments and press Enter yourself.
 */
export function SkillList() {
  const transport = useTransport()
  const { active, activeSession } = useAppStore(
    useShallow((s) => ({ active: s.active, activeSession: s.activeSession })),
  )
  const skills = useClientStore((s) => s.skills)
  const session = active ? activeSession[active] : undefined
  const list = session ? skills[session] : undefined
  const [filter, setFilter] = useState('')

  // Refresh when the active session changes.
  useEffect(() => {
    if (session) transport.send({ type: 'list-skills', session })
  }, [session, transport])

  // Prepare each card's view data once (title, command, description), so the JSX only renders.
  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const items = (list ?? []).filter(
      (skill) =>
        !query ||
        skill.name.toLowerCase().includes(query) ||
        (skill.description ?? '').toLowerCase().includes(query),
    )

    return items.map((skill) => ({
      key: `${skill.kind}:${skill.scope}:${skill.name}`,
      name: skill.name,
      title: humanize(skill.name),
      command: `/${skill.name}`,
      description: skill.description ?? null,
      kind: capitalize(skill.kind),
      scope: capitalize(skill.scope),
    }))
  }, [list, filter])

  if (!session) return null

  const insert = (name: string) => {
    transport.send({ type: 'input', session, data: `/${name} ` })
  }

  return (
    <div className={styles.skills}>
      <input
        className={styles.filter}
        placeholder="Filter skills"
        value={filter}
        onChange={(event) => setFilter(event.currentTarget.value)}
      />
      {list === undefined ? (
        <div className={styles.empty}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>No skills</div>
      ) : (
        rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className={styles.skill}
            onClick={() => insert(row.name)}
            title={`Insert ${row.command}`}
          >
            <span className={styles.name}>{row.title}</span>
            <span className={styles.command}>{row.command}</span>
            {row.description && <span className={styles.desc}>{row.description}</span>}
            <span className={styles.meta}>
              <span className={styles.tag}>{row.kind}</span>
              <span className={styles.tag}>{row.scope}</span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}
