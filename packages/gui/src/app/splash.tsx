//Packages
import { Spinner } from '@soromi/ui'

//Icons
import IsoLogo from '@/assets/icons/iso-dark.svg?react'

/** Shown on launch until the daemon's first workspace list arrives, so the shell never flashes. */
export function Splash() {
  return (
    <div className="fixed inset-0 z-[var(--z-splash)] flex flex-col items-center justify-center gap-[22px] bg-[var(--soromi-bg-app)]">
      <IsoLogo width={52} height={52} className="motion-safe:animate-pulse" />
      <Spinner size={22} />
    </div>
  )
}
