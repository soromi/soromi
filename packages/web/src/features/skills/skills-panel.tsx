import { useEffect } from 'react'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { SkillList } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Styles
import styles from './skills-panel.module.css'

/**
 * The Skills view: the shared skill cards; tapping one types `/name ` in and returns to the
 * terminal. `full` shows the filter + kind/scope tags (the desktop treatment, used in the wide
 * sidebar); the phone tab omits them to stay lean.
 */
export function SkillsPanel({
  session,
  showHeading = true,
  full = false,
}: {
  session?: string
  showHeading?: boolean
  full?: boolean
}) {
  const transport = useTransport()
  const setTab = useUiStore((s) => s.setTab)
  const skills = useClientStore((s) => (session ? s.skills[session] : undefined))

  useEffect(() => {
    if (session) transport.send({ type: 'list-skills', session })
  }, [session, transport])

  const insert = (name: string) => {
    if (!session) return
    transport.send({ type: 'input', session, data: `/${name} ` })
    setTab('terminal')
  }

  return (
    <section className={styles.panel}>
      {showHeading && <h2 className={styles.heading}>Skills</h2>}
      <div className={styles.list}>
        {!session ? (
          <div className={styles.empty}>No session</div>
        ) : (
          <SkillList skills={skills} onInsert={insert} showFilter={full} showTags={full} />
        )}
      </div>
    </section>
  )
}
