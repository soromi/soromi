/**
 * How long the window may be in front with nobody using it before the person counts as away: the
 * daemon then pushes banners to their phone again, as it does when the window is behind another.
 */
export const AWAY_MS = 3 * 60 * 1000

/** How often an unused window is looked at again, to notice it has been left. */
const CHECK_MS = 15_000

/** What counts as someone using the window. */
const INPUT_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const

/** Whether someone is at the app: its window is in front, and was used within `AWAY_MS`. */
export function isAttended(focused: boolean, lastInput: number, now: number): boolean {
  return focused && now - lastInput < AWAY_MS
}

/**
 * Follows whether someone is at the app and calls `report` each time that changes, and once to
 * start. The window coming to the front counts as being used. `resend` reports it again (to a
 * daemon that started over); `stop` ends it.
 */
export function watchAttention(report: (attended: boolean) => void) {
  let lastInput = Date.now()
  let reported: boolean | null = null

  const check = () => {
    const attended = isAttended(document.hasFocus(), lastInput, Date.now())
    if (attended === reported) return
    reported = attended
    report(attended)
  }
  const onInput = () => {
    lastInput = Date.now()
    // Back from being away: said at once, not at the next look.
    if (reported === false) check()
  }
  const onFocus = () => {
    lastInput = Date.now()
    check()
  }

  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', check)
  for (const event of INPUT_EVENTS) window.addEventListener(event, onInput, { passive: true })
  const timer = setInterval(check, CHECK_MS)
  check()

  return {
    resend: () => {
      reported = null
      check()
    },
    stop: () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', check)
      for (const event of INPUT_EVENTS) window.removeEventListener(event, onInput)
    },
  }
}
