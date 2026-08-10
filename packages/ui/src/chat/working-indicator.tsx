import { type CSSProperties, useEffect, useRef, useState } from 'react'

//Components
import { Shimmer } from '../components/ai-elements/shimmer'
import { WorkingMark } from './working-mark'

// Whimsical status words that cycle while a turn runs (à la Claude Code's spinner). Ours, not theirs.
const WORKING_WORDS = [
  'Thinking',
  'Working',
  'Pondering',
  'Crunching',
  'Reasoning',
  'Digging in',
  'Noodling',
  'Cooking',
  'Untangling',
  'Percolating',
  'Synthesizing',
  'Mulling',
  'Scheming',
  'Wrangling',
]

/** Cycles the working word every few seconds, starting on a random one so each turn reads differently. */
function useWorkingWord(): string {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * WORKING_WORDS.length))
  useEffect(() => {
    const id = setInterval(() => setIndex((n) => (n + 1) % WORKING_WORDS.length), 3500)
    return () => clearInterval(id)
  }, [])
  return WORKING_WORDS[index]
}

/**
 * Whole seconds elapsed since the turn's start (`since`, a Unix-ms timestamp). Ticks once a second.
 * Falls back to mount time when `since` is absent, so the clock survives the pane remounting on a
 * chat switch (the daemon owns the running turn, not this component).
 */
function useElapsed(since: number | null | undefined): number {
  const fallback = useRef(Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const start = since ?? fallback.current
  return Math.max(0, Math.floor((now - start) / 1000))
}

/**
 * Live "agent is working" indicator: an accent icon plus a shimmering, cycling status word and the
 * running seconds — the way Claude Code rotates its spinner words. The `--color-background` override
 * flips the AI Elements Shimmer's sweep to a light highlight, since our app background is dark.
 *
 * Owns its own word + second timers so those ticks re-render only this indicator, not the whole view.
 */
export function WorkingIndicator({ since }: { since?: number | null }) {
  const word = useWorkingWord()
  const elapsed = useElapsed(since)
  return (
    <div
      className="flex items-center gap-2 py-1 text-[13px] leading-none"
      style={{ '--color-background': 'var(--soromi-text)' } as CSSProperties}
    >
      <WorkingMark size={11} />
      <Shimmer duration={1.6}>{word}</Shimmer>
      <span className="text-[var(--soromi-text-faint)] tabular-nums">· {elapsed}s</span>
      <span className="text-[var(--soromi-text-faint)]">
        · <kbd className="font-sans">esc</kbd> to interrupt
      </span>
    </div>
  )
}
