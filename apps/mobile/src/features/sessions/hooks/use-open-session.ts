import { useRouter } from 'expo-router'
import { useCallback } from 'react'

//Helpers
import { getSessionHref } from '../helpers'

//Hooks
import { useLayout } from '@/hooks/use-layout'

/**
 * Goes to a session's conversation. On a phone that is one more screen to come back from. Beside
 * the sessions column it takes the place of whatever was open: the column is how you move between
 * sessions there, so there is nothing to come back to.
 */
export const useOpenSession = () => {
  const router = useRouter()
  const wide = useLayout().wide

  return useCallback(
    (id: string) => {
      if (wide && router.canDismiss()) router.dismissAll()
      router.push(getSessionHref(id))
    },
    [router, wide],
  )
}
