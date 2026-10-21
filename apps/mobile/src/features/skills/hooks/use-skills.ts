import { useEffect } from 'react'

//Services
import { LinkService } from '@/services/link'

//State
import { useDaemonSkills } from '@/states/daemon/daemon.state.hook'

/**
 * A session's slash commands and skills, asked for when the list is shown and again whenever the
 * link comes back. `undefined` until the first answer.
 */
export const useSkills = (session: string) => {
  const skills = useDaemonSkills(session)

  useEffect(() => {
    const ask = () => LinkService.send({ type: 'list-skills', session })
    ask()

    return LinkService.onOpen(ask)
  }, [session])

  return skills
}
