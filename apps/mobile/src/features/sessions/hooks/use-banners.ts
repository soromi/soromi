import { useGlobalSearchParams } from 'expo-router'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

//Helpers
import { isSeen } from '../helpers'

//Hooks
import { useOpenSession } from './use-open-session'

//Services
import { AnswerService } from '@/services/answers'
import { ComputersService } from '@/services/computers'
import { LinkService } from '@/services/link'
import { NotificationService } from '@/services/notifications'
import { toAnswered } from '@/services/notifications.helpers'

//State
import { LinkStore } from '@/states/link/link.state'
import { useLinkPaired } from '@/states/link/link.state.hook'

/**
 * The computer's banners, on the phone: a task finished, an agent needs a permission or is waiting
 * for an answer. They are the ones the desktop shows, decided by the daemon (a muted workspace
 * sends none), and tapping one opens the session it is about.
 *
 * The daemon cannot see this screen, so the phone drops the one banner that would say nothing new:
 * the one about the session that is open in front of the person.
 *
 * They come two ways. With the app on screen, over the link, and the app posts them. With it
 * closed or behind another app, pushed through Apple or Google, where the build has the
 * credentials for that; the daemon picks one way for each banner, by what the app last told it.
 */
export const useBanners = () => {
  const paired = useLinkPaired()
  const open = useOpenSession()
  const params = useGlobalSearchParams<{ id?: string }>()
  const session = params.id
  // Read when a banner arrives, which is not a reason to start listening over.
  const viewed = useRef(session)

  // A banner pushed just as the app comes back arrives with it open: the same rule applies.
  useEffect(
    () =>
      NotificationService.setup((target) => {
        const view = { active: AppState.currentState === 'active', session: viewed.current }

        return !isSeen(target?.session, view)
      }),
    [],
  )

  // The daemon sends banners over the link while the app is on screen, and pushes them once it is
  // not. A glance at the app switcher is not leaving: only the background is.
  useEffect(() => {
    LinkService.setAttended(AppState.currentState !== 'background')
    const subscription = AppState.addEventListener('change', (state) =>
      LinkService.setAttended(state !== 'background'),
    )

    return () => subscription.remove()
  }, [])

  // The session on screen is being looked at: a banner about it has nothing left to say.
  useEffect(() => {
    viewed.current = session
    if (session) void NotificationService.clear(session)
  }, [session])

  // Asked once the phone has a computer to hear from, not as the first thing the app ever does.
  useEffect(() => {
    if (!paired) return
    let stop = () => {}
    let left = false
    const start = async () => {
      const allowed = await NotificationService.allow()
      if (!allowed || left) return
      stop = LinkService.watchBanners((banner) => {
        // A banner about no session in particular comes without one, whatever its type says.
        const about = banner.session ?? undefined
        const view = { active: AppState.currentState === 'active', session: viewed.current }
        if (isSeen(about, view)) return
        void NotificationService.show({
          title: banner.title,
          body: banner.body,
          session: about,
          approval: banner.approval ?? undefined,
        })
      })
      // For when the app is not there to be told: without a token it only has the link.
      const token = await NotificationService.getPushToken()
      if (!left) LinkService.setPushToken(token)
    }
    void start()

    return () => {
      left = true
      stop()
    }
  }, [paired])

  useEffect(() => {
    if (!paired) return

    // One of a tool request's buttons answers it where the app is, out of sight or not, on the
    // computer that asked; nothing is opened. A tap on a banner opens its session, bringing in
    // first the computer that pushed it when that is another one the phone is paired with.
    return NotificationService.onOpen((target) => {
      const answered = toAnswered(target)
      if (answered) {
        void AnswerService.answer(answered)
        return
      }
      const current = LinkStore.getState().pairing.current?.device
      if (target.device && target.device !== current) {
        void ComputersService.use(target.device).then(() => open(target.session))
        return
      }
      open(target.session)
    })
  }, [paired, open])
}
