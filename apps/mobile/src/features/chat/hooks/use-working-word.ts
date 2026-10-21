import { useEffect, useState } from 'react'

import { WORKING_WORDS, WORKING_WORD_MS } from '@soromi/core'

/** The word for "the agent is working", moving on every few seconds. Each turn starts on a random one. */
export const useWorkingWord = (): string => {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * WORKING_WORDS.length))

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % WORKING_WORDS.length),
      WORKING_WORD_MS,
    )

    return () => clearInterval(timer)
  }, [])

  return WORKING_WORDS[index] ?? WORKING_WORDS[0]
}
