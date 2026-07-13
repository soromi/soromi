/** True on macOS. The primary shortcut modifier is ⌘ (Meta) on macOS, Ctrl elsewhere. */
export const isMac =
  typeof navigator !== 'undefined' &&
  /mac/i.test(
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent,
  )

/** The primary-modifier label for shortcut hints: "⌘" on macOS, "Ctrl " elsewhere. */
export const modLabel = isMac ? '⌘' : 'Ctrl '
