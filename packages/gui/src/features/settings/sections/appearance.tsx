import { useShallow } from 'zustand/react/shallow'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { MoonIcon, SunIcon } from '../nav-icons'

//Styles
import { DESC, H2, SECTION, SECTION_HEAD } from '../styles'

/** Light/dark appearance toggle. */
export function AppearanceSection() {
  const { theme, toggleTheme } = useAppStore(
    useShallow((s) => ({ theme: s.theme, toggleTheme: s.toggleTheme })),
  )

  return (
    <section className={SECTION}>
      <div className={SECTION_HEAD}>
        <div>
          <h2 className={H2}>Appearance</h2>
          <p className={DESC}>
            Switch between light and dark. You can also toggle from the sidebar.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex cursor-pointer appearance-none items-center gap-2.5 self-start rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-4 py-2.5 font-semibold text-[13.5px] text-[var(--soromi-text-dim)] transition-colors hover:border-[var(--soromi-accent)] hover:text-[var(--soromi-accent)]"
      >
        {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        {theme === 'light' ? 'Switch to dark' : 'Switch to light'}
      </button>
    </section>
  )
}
