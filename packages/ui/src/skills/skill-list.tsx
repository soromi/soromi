import { useMemo, useState } from 'react'

//Styles
import styles from './skill-list.module.css'

//Types
import type { Skill } from '@soromi/protocol'

/** A human title from a command name: `code-review` -> `Code review`. */
function humanize(name: string): string {
  const spaced = name.replace(/[-_]/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export interface SkillListProps {
  /** The session's skills, or `undefined` while still loading. */
  skills: Skill[] | undefined
  /** Called with the command name when a card is tapped (the host types `/name ` into the terminal). */
  onInsert: (name: string) => void
  /** Show the filter input above the cards. */
  showFilter?: boolean
  /** Show the kind / scope tags on each card. */
  showTags?: boolean
}

/**
 * Presentational list of a session's slash commands and skills, as cards (title, `/command` chip,
 * description, and optional kind / scope tags). It owns only its filter text; the host wires the
 * data and the insert action, so it renders the same on desktop and web.
 */
export function SkillList({
  skills,
  onInsert,
  showFilter = true,
  showTags = true,
}: SkillListProps) {
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const items = (skills ?? []).filter(
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
  }, [skills, filter])

  return (
    <div className={styles.skills}>
      {showFilter && (
        <input
          className={styles.filter}
          placeholder="Filter skills"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
      )}
      {skills === undefined ? (
        <div className={styles.empty}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>No skills</div>
      ) : (
        rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className={styles.skill}
            onClick={() => onInsert(row.name)}
            title={`Insert ${row.command}`}
          >
            <span className={styles.name}>{row.title}</span>
            <span className={styles.command}>{row.command}</span>
            {row.description && <span className={styles.desc}>{row.description}</span>}
            {showTags && (
              <span className={styles.meta}>
                <span className={styles.tag}>{row.kind}</span>
                <span className={styles.tag}>{row.scope}</span>
              </span>
            )}
          </button>
        ))
      )}
    </div>
  )
}
