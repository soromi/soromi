import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

/**
 * The phone's screen, kept on. Each hold has a name, and the screen may dim again once every hold
 * is let go. This is the only place that imports the keep-awake module.
 */
export const ScreenService = {
  /** Keeps the screen on while the app is in front, until `release` is called with the same name. */
  keepOn: async (name: string): Promise<void> => {
    try {
      await activateKeepAwakeAsync(name)
    } catch {
      // A device that cannot hold the screen on just dims it as usual.
    }
  },
  release: async (name: string): Promise<void> => {
    try {
      await deactivateKeepAwake(name)
    } catch {
      // Nothing was held.
    }
  },
}
