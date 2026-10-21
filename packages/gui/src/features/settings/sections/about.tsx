//Packages
import { useTransport } from '@soromi/client'

//Components
import { AboutHero } from '@/shared/about-hero'
import { SETTINGS_BUTTON, SettingsGroup, SettingsPage, SettingsRow } from '../layout'

//Utils
import { openExternal } from '@/lib/host'

//Constants
import { REPO_URL } from '@/config'

/** Which Soromi this is, a way to look for a newer one, and where to read about it. */
export function AboutSection() {
  const transport = useTransport()

  return (
    <SettingsPage title="About">
      <div className="overflow-hidden rounded-[12px] border border-[var(--soromi-border)]">
        <AboutHero fade="var(--soromi-bg-terminal)" />
      </div>
      <SettingsGroup>
        <SettingsRow
          title="Updates"
          description="Soromi checks for a newer release by itself, and says so here and in the window."
          control={
            <button
              type="button"
              className={SETTINGS_BUTTON}
              onClick={() => transport.send({ type: 'check-update' })}
            >
              Check now
            </button>
          }
        />
        <SettingsRow
          title="Help & docs"
          description="How Soromi works, and what is new."
          control={
            <button
              type="button"
              className={SETTINGS_BUTTON}
              onClick={() => openExternal(REPO_URL)}
            >
              Open
            </button>
          }
        />
      </SettingsGroup>
    </SettingsPage>
  )
}
