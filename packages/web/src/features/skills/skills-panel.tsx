import { useEffect } from 'react'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { SkillList } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

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
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {showHeading && (
        <h2 className="m-0 px-4 pt-4 pb-2.5 font-bold text-[13px] text-[var(--soromi-text)]">
          Skills
        </h2>
      )}
      <div className="px-2.5 pb-5">
        {!session ? (
          <div className="px-4 py-8 text-center text-[var(--soromi-text-faint)] text-sm">
            No session
          </div>
        ) : (
          <SkillList skills={skills} onInsert={insert} showFilter={full} showTags={full} />
        )}
      </div>
    </section>
  )
}
