import { useState } from 'react'

//Components
import { OverlayNav, OverlayNavItem, OverlayShell } from '@/shared/overlay-shell'
import {
  NavAboutIcon,
  NavAccountsIcon,
  NavAppearanceIcon,
  NavNotificationsIcon,
  NavRemoteIcon,
} from './nav-icons'
import { AboutSection } from './sections/about'
import { AccountsSection } from './sections/accounts'
import { AppearanceSection } from './sections/appearance'
import { NotificationsSection } from './sections/notifications'
import { RemoteSettings } from './remote-settings'

//Icons
import SettingsSvg from '@/assets/icons/settings.svg?react'

type SettingsSection = 'accounts' | 'appearance' | 'notifications' | 'remote' | 'about'

/**
 * Settings overlay: a left nav whose items switch the content to their own pane. Each pane is its own
 * component (see `./sections/*`), so only the active section renders.
 */
export function Settings() {
  const [section, setSection] = useState<SettingsSection>('accounts')

  return (
    <OverlayShell
      icon={<SettingsSvg width={18} height={18} />}
      title="Settings"
      nav={
        <OverlayNav label="Settings">
          <OverlayNavItem
            icon={<NavAccountsIcon />}
            label="Accounts"
            active={section === 'accounts'}
            onClick={() => setSection('accounts')}
          />
          <OverlayNavItem
            icon={<NavAppearanceIcon />}
            label="Appearance"
            active={section === 'appearance'}
            onClick={() => setSection('appearance')}
          />
          <OverlayNavItem
            icon={<NavNotificationsIcon />}
            label="Notifications"
            active={section === 'notifications'}
            onClick={() => setSection('notifications')}
          />
          <OverlayNavItem
            icon={<NavRemoteIcon />}
            label="Remote"
            active={section === 'remote'}
            onClick={() => setSection('remote')}
          />
          <OverlayNavItem
            icon={<NavAboutIcon />}
            label="About"
            active={section === 'about'}
            onClick={() => setSection('about')}
          />
        </OverlayNav>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[760px] px-7 pt-11 pb-[180px]">
          {section === 'accounts' && <AccountsSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'remote' && <RemoteSettings />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </OverlayShell>
  )
}
