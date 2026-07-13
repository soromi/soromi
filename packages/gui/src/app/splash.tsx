import { Loader } from '@mantine/core'

//Icons
import IsoLogo from '@/assets/icons/iso-dark.svg?react'

//Styles
import styles from './splash.module.css'

/** Shown on launch until the daemon's first workspace list arrives, so the shell never flashes. */
export function Splash() {
  return (
    <div className={styles.splash}>
      <IsoLogo width={52} height={52} className={styles.logo} />
      <Loader size="sm" color="jade" />
    </div>
  )
}
