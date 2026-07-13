//Components
import { DevicesWidget } from './devices-widget'
import { UsageWidget } from './usage-widget'

//Styles
import styles from './status-bar.module.css'

/** The bottom status bar: usage on the left, connected devices on the right. */
export function StatusBar() {
  return (
    <div className={styles.bar}>
      <UsageWidget />
      <DevicesWidget />
    </div>
  )
}
