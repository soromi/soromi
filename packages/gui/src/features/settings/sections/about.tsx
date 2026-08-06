//Packages
import { useTransport } from '@soromi/client'

//Constants
import { APP_VERSION } from '@/config'

//Styles
import { DESC, H2, SECTION, SECTION_HEAD } from '../styles'

/** App version + a manual update check. */
export function AboutSection() {
  const transport = useTransport()
  const checkUpdate = () => transport.send({ type: 'check-update' })

  return (
    <section className={SECTION}>
      <div className={SECTION_HEAD}>
        <div>
          <h2 className={H2}>About</h2>
          <p className={DESC}>Soromi Desktop {APP_VERSION}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={checkUpdate}
        className="inline-flex cursor-pointer appearance-none items-center gap-2.5 self-start rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-4 py-2.5 font-semibold text-[13.5px] text-[var(--soromi-text-dim)] transition-colors hover:border-[var(--soromi-accent)] hover:text-[var(--soromi-accent)]"
      >
        Check for updates
      </button>
    </section>
  )
}
