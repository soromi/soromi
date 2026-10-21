import { requireOptionalNativeModule } from 'expo'

/** Asks iOS for time to finish in the background, and gives it back. */
type BackgroundTime = {
  begin: (seconds: number) => Promise<void>
  end: () => Promise<void>
}

/**
 * The app's own native module (`ios/`), which only iOS needs: Android runs an answer in a task of
 * its own, with the time it takes. `null` there, and in a build without it.
 */
export default requireOptionalNativeModule<BackgroundTime>('BackgroundTime')
