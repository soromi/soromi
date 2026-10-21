//Constants
import { ANSWERS } from './answers.constants'

//Services
import { BackgroundService } from './background'
import { KeychainService } from './keychain'
import { LinkService } from './link'
import { NotificationService } from './notifications'

//State
import { LinkStore } from '@/states/link/link.state'

//Type
import type { ClientMessage } from '@soromi/protocol'
import type { BannerAnswered } from './notifications.type'

/**
 * The tool requests answered in this run of the app. An answer can arrive two ways at once (on
 * Android, as a task and to the app that is behind another one); it is sent once.
 */
const answered = new Set<string>()

/**
 * Sends the answer to the computer that asked. When this run of the app is using that computer,
 * over its link, now or once it is made (an app started to send the answer makes one as it
 * starts). Otherwise, over a link of its own to that computer: for a banner from another computer,
 * or an app the system started with no screen, which has no link at all.
 */
const send = async (target: BannerAnswered): Promise<boolean> => {
  const message: ClientMessage = {
    type: 'chat-approval-response',
    session: target.session,
    id: target.approval,
    allow: target.answer === 'allow',
  }
  const inUse = LinkStore.getState().pairing.current?.device
  if (inUse && (!target.device || target.device === inUse)) {
    return LinkService.sendConfirmed(message, ANSWERS.timeoutMs)
  }
  const { computers, active } = await KeychainService.loadComputers()
  const device = target.device ?? active
  const computer = computers.find((one) => one.pairing.device === device)
  if (!computer) return false
  const [clientId, routes] = await Promise.all([
    KeychainService.getClientId(),
    KeychainService.loadRoutes(computer.pairing.device),
  ])

  return LinkService.sendOnce(computer.pairing, clientId, routes, message, ANSWERS.timeoutMs)
}

/**
 * Answers to tool requests given from a banner's Allow or Deny, which do not bring the app up:
 * the answer is sent where it is, the app out of sight, and the banner goes once the computer has
 * it. Any device may answer, and the first answer is the one taken.
 */
export const AnswerService = {
  /**
   * Sends one. The app is given the time to (iOS would suspend it otherwise). One that could not
   * be sent leaves a banner in place of the question saying so, which opens the session.
   */
  answer: async (target: BannerAnswered): Promise<void> => {
    if (answered.has(target.approval)) return
    answered.add(target.approval)
    const done = BackgroundService.keepRunning()
    try {
      const sent = await send(target)
      if (sent) {
        await NotificationService.clear(target.banner ?? target.session)
        return
      }
      // Asked again from the session, the question can still be answered.
      answered.delete(target.approval)
      await NotificationService.show({ ...ANSWERS.failed, session: target.session })
    } finally {
      done()
    }
  },
}
