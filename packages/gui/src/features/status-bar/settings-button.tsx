//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { STATUS_ICON } from './keep-awake-widget'

//Icons
import SettingsSvg from '@/assets/icons/settings.svg?react'

/** Settings, at the left of the status bar (also in the Soromi menu, and on ⌘,). */
export function SettingsButton() {
  const openSettings = useAppStore((s) => s.openSettings)

  return (
    <button type="button" title="Settings" className={STATUS_ICON} onClick={openSettings}>
      <SettingsSvg width={15} height={15} />
    </button>
  )
}
