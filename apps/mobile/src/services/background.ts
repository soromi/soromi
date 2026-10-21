//Native
import BackgroundTime from '../../modules/background-time'

//Constants
import { BACKGROUND } from './background.constants'

/**
 * Time for the app to finish something out of sight before the system suspends it: an answer
 * given from a banner's button, which has to reach the computer. Only iOS needs asking, through
 * the app's own native module; Android runs such an answer in a task with the time it takes.
 * This is the only place that imports the module.
 */
export const BackgroundService = {
  /** Asks for the time, and returns how to give it back once done. */
  keepRunning: (seconds: number = BACKGROUND.seconds): (() => void) => {
    const native = BackgroundTime
    if (!native) return () => {}
    void native.begin(seconds).catch(() => {
      // Without it the app may be suspended sooner; the answer is tried all the same.
    })

    return () => void native.end().catch(() => {})
  },
}
