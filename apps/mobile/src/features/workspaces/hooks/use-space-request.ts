import { useCallback, useEffect, useRef, useState } from 'react'

//Services
import { LinkService } from '@/services/link'

//Type
import type { ClientMessage } from '@soromi/protocol'

/**
 * Sends what creates, imports or saves a workspace, and waits for the computer to say how it went:
 * the workspace it opened (called back with its name), or why it could not.
 */
export const useSpaceRequest = () => {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Who to tell when the answer comes; one request at a time.
  const done = useRef<((workspace: string) => void) | null>(null)

  useEffect(
    () =>
      LinkService.onMessage((message) => {
        if (!done.current) return
        if (message.type === 'workspace-opened') {
          const call = done.current
          done.current = null
          setPending(false)
          call(message.workspace)
        } else if (message.type === 'error') {
          done.current = null
          setPending(false)
          setError(message.message)
        }
      }),
    [],
  )

  const send = useCallback((message: ClientMessage, onDone: (workspace: string) => void) => {
    done.current = onDone
    setError(null)
    setPending(true)
    LinkService.send(message)
  }, [])

  return { pending, error, send }
}
