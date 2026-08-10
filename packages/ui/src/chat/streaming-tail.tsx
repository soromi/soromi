import { useEffect, useRef, useState } from 'react'

//Components
import { Markdown } from './markdown'

/**
 * Reveals `target` at a steady typing cadence instead of jumping to each new chunk. It only ever adds
 * characters toward the current target; a fresh message (target no longer a superset of what's shown)
 * resets, and the step scales with how far behind it is so it keeps up with fast bursts without ever
 * dumping a whole line at once.
 */
function useSmoothText(target: string): string {
  const [shown, setShown] = useState('')
  const targetRef = useRef('')

  useEffect(() => {
    targetRef.current = target
    setShown((current) => (target.startsWith(current) ? current : ''))
  }, [target])

  useEffect(() => {
    if (shown === target && target.startsWith(shown)) return
    const id = setTimeout(() => {
      setShown((current) => {
        const goal = targetRef.current
        if (!goal.startsWith(current)) return ''
        if (current.length >= goal.length) return goal
        const step = Math.max(3, Math.ceil((goal.length - current.length) / 6))
        return goal.slice(0, current.length + step)
      })
    }, 24)
    return () => clearTimeout(id)
  }, [shown, target])

  return shown
}

/**
 * The live assistant reply, paced to type out steadily. Owns the smoothing timer, so its frequent
 * (~40×/sec) updates re-render only this node instead of the whole ChatView and every committed row.
 */
export function StreamingTail({ text }: { text: string }) {
  const revealed = useSmoothText(text)
  if (!revealed) return null
  return <Markdown incomplete>{revealed}</Markdown>
}
