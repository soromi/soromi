import { useMemo, useState } from 'react'

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
    <div className="flex flex-col gap-2.5 px-1">
      {showFilter && (
        <input
          className="rounded-[9px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-[11px] py-2 text-[12.5px] text-[var(--soromi-text)] focus:border-[var(--soromi-accent)] focus:outline-none"
          placeholder="Filter skills"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
      )}
      {skills === undefined ? (
        <div className="p-3 text-[12.5px] text-[var(--soromi-text-faint)]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-3 text-[12.5px] text-[var(--soromi-text-faint)]">No skills</div>
      ) : (
        rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className="flex cursor-pointer appearance-none flex-col gap-2 rounded-[13px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-tab)] px-4 py-3.5 text-left transition-colors hover:border-[var(--soromi-accent-border)] hover:bg-[var(--soromi-bg-hover)]"
            onClick={() => onInsert(row.name)}
            title={`Insert ${row.command}`}
          >
            <span className="font-bold text-[15px] text-[var(--soromi-text)]">{row.title}</span>
            <span className="-mt-0.5 self-start whitespace-nowrap rounded-[7px] border border-[var(--soromi-accent-border)] bg-[var(--soromi-accent-dim)] px-2 py-[3px] text-[11px] text-[var(--soromi-accent)] [font-family:var(--soromi-font-mono)]">
              {row.command}
            </span>
            {row.description && (
              <span className="line-clamp-2 text-[13px] text-[var(--soromi-text-faint)] leading-[1.5]">
                {row.description}
              </span>
            )}
            {showTags && (
              <span className="mt-0.5 flex gap-1.5">
                <span className="rounded-md border border-[var(--soromi-border)] px-[7px] py-0.5 font-medium text-[10px] text-[var(--soromi-text-faint)] uppercase tracking-[0.05em]">
                  {row.kind}
                </span>
                <span className="rounded-md border border-[var(--soromi-border)] px-[7px] py-0.5 font-medium text-[10px] text-[var(--soromi-text-faint)] uppercase tracking-[0.05em]">
                  {row.scope}
                </span>
              </span>
            )}
          </button>
        ))
      )}
    </div>
  )
}
