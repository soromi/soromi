import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Styles
import styles from './skill-list.module.css'

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

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const items = list ?? []
    if (!query) return items
    return items.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        (skill.description ?? '').toLowerCase().includes(query),
    )
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
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No skills</div>
      ) : (
        filtered.map((skill) => (
          <button
            key={`${skill.kind}:${skill.scope}:${skill.name}`}
            type="button"
            className={styles.skill}
            onClick={() => insert(skill.name)}
            title={`Insert /${skill.name}`}
          >
            <span className={styles.head}>
              <span className={styles.name}>/{skill.name}</span>
              <span className={styles.scope}>{skill.scope}</span>
            </span>
            {skill.description && <span className={styles.desc}>{skill.description}</span>}
          </button>
        ))
      )}
    </div>
  )
}
