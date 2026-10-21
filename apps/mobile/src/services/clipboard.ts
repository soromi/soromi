import * as Clipboard from 'expo-clipboard'

/** The phone's clipboard. This is the only place that imports it. */
export const ClipboardService = {
  /** Puts a text on the clipboard, in place of whatever was there. */
  copy: async (text: string): Promise<void> => {
    await Clipboard.setStringAsync(text)
  },
}
