import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { Button } from '@soromi/ui'

//Icons
import BellOffSvg from '@/assets/icons/bell-off.svg?react'

//Styles
import { CARD_NAME, DESC, H2, SECTION, SECTION_HEAD } from '../styles'

/** Muted workspaces: the ones whose notifications are silenced, with an unmute action. */
export function NotificationsSection() {
  const transport = useTransport()
  const { workspaces, muted, setMuted } = useClientStore(
    useShallow((s) => ({ workspaces: s.workspaces, muted: s.muted, setMuted: s.setMuted })),
  )
  const mutedNames = workspaces.filter((w) => muted[w.name]).map((w) => w.name)

  const unmute = (workspace: string) => {
    setMuted(workspace, false)
    transport.send({ type: 'mute-workspace', workspace, muted: false })
  }

  return (
    <section className={SECTION}>
      <div className={SECTION_HEAD}>
        <div>
          <h2 className={H2}>Muted workspaces</h2>
          <p className={DESC}>Workspaces with notifications silenced.</p>
        </div>
      </div>

      {mutedNames.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--soromi-border)] border-dashed px-6 py-12 text-center">
          <span className="mb-1.5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--soromi-bg-hover)] text-[var(--soromi-text-faint)]">
            <BellOffSvg width={22} height={22} />
          </span>
          <div className="text-[15px] text-[var(--soromi-text-dim)]">No muted workspaces</div>
          <div className="text-[13px] text-[var(--soromi-text-faint)]">
            Silenced workspaces show up here.
          </div>
        </div>
      ) : (
        mutedNames.map((workspace) => (
          <div
            key={workspace}
            className="flex items-center justify-between rounded-[10px] border border-[var(--soromi-border)] px-3.5 py-2.5"
          >
            <span className={CARD_NAME}>{workspace}</span>
            <Button variant="ghost" size="sm" onClick={() => unmute(workspace)}>
              Unmute
            </Button>
          </div>
        ))
      )}
    </section>
  )
}
