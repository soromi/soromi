//Components
import { Chip } from '@/components'

//Constants
import { LINK } from '../constants/link'

//State
import { useLinkRoute } from '@/states/link/link.state.hook'

/**
 * Which way the app is talking to the computer right now: straight to it on a shared network, or
 * through the relay. Renders nothing while it is not talking to it at all.
 */
export const RouteBadge = () => {
  const route = useLinkRoute()
  if (route === null) return null

  return <Chip filled icon={LINK.routes[route].icon} label={LINK.routes[route].label} />
}
