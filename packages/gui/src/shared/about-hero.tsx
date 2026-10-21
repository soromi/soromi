//Components
import { Backdrop, BackdropTile } from './backdrop'
import { SoromiMark } from './soromi-mark'

//Constants
import { APP_VERSION } from '@/config'

/**
 * Soromi's mark on the grid-and-glow backdrop, with its name and version: the top of About, in
 * its dialog and in Settings. `fade` is the surface it sits on.
 */
export function AboutHero({ fade }: { fade: string }) {
  return (
    <Backdrop fade={fade} className="flex h-[196px] flex-col items-center justify-center gap-3">
      <div className="relative z-10">
        <BackdropTile size="lg">
          <SoromiMark width={30} height={27} />
        </BackdropTile>
      </div>
      <div className="relative z-10 text-center">
        <div className="font-semibold text-[16px] text-[var(--soromi-text)]">Soromi</div>
        <div className="mt-0.5 text-[12px] text-[var(--soromi-text-faint)]">
          Version {APP_VERSION}
        </div>
      </div>
    </Backdrop>
  )
}
