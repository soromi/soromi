import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { Platform } from 'react-native'

//Constants
import { NOTIFICATIONS } from './notifications.constants'

//Helpers
import {
  getBannerId,
  toAnswered,
  toData,
  toResponseTarget,
  toTarget,
} from './notifications.helpers'

//Type
import type { Banner, BannerAnswered, BannerTarget } from './notifications.type'

/**
 * The phone's notifications, which come two ways. While the app is on screen, the computer tells
 * it of a banner over the link and the app posts it itself. While it is not, the computer hands
 * the banner to a push service, which reaches the phone through Apple or Google; the system shows
 * that one without the app running. This is the only place that imports the notifications module
 * and the task manager it runs Android's answers with.
 */
export const NotificationService = {
  /**
   * Once, when the app starts. A banner that arrives with the app open is shown if `isWanted`
   * says so, given what it is about: one that was pushed just as the app came back may be about
   * what is now on screen. Android gets the channel banners are posted on.
   */
  setup: (isWanted: (target: BannerTarget | null) => boolean): void => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const wanted = isWanted(toTarget(notification.request.content.data))

        return {
          shouldShowBanner: wanted,
          shouldShowList: wanted,
          shouldPlaySound: wanted,
          shouldSetBadge: false,
        }
      },
    })
    // Does nothing on iOS, which has no channels.
    void Notifications.setNotificationChannelAsync(NOTIFICATIONS.channel.id, {
      name: NOTIFICATIONS.channel.name,
      importance: Notifications.AndroidImportance.HIGH,
    })
    // A tool request is answered from its banner, without the app coming up: the system starts it
    // out of sight to send the answer (see `onBackgroundAnswer`). iOS asks for the phone to be
    // unlocked first, as it should for letting an agent run something, and which the keychain
    // the pairing is kept in needs.
    const { approval } = NOTIFICATIONS
    void Notifications.setNotificationCategoryAsync(approval.category, [
      {
        identifier: approval.allow.id,
        buttonTitle: approval.allow.title,
        options: { opensAppToForeground: false, isAuthenticationRequired: true },
      },
      {
        identifier: approval.deny.id,
        buttonTitle: approval.deny.title,
        options: {
          opensAppToForeground: false,
          isAuthenticationRequired: true,
          isDestructive: true,
        },
      },
    ]).catch(() => {
      // Without the category the banner still opens the session, where the request is answered.
    })
  },

  /** Whether banners may be shown, asking the person the first time. */
  allow: async (): Promise<boolean> => {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    if (!current.canAskAgain) return false
    const asked = await Notifications.requestPermissionsAsync()

    return asked.granted
  },

  /**
   * What the computer needs to have banners pushed to this phone, or `null` when the phone cannot
   * take them: a build without the push credentials, a simulator, no network. The app then only
   * has the banners the link brings while it is open.
   */
  getPushToken: async (): Promise<string | null> => {
    try {
      const token = await Notifications.getExpoPushTokenAsync()

      return token.data
    } catch {
      return null
    }
  },

  /** Posts a banner now, in place of the last one about the same session. */
  show: async (banner: Banner): Promise<void> => {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: getBannerId(banner),
        content: {
          title: banner.title,
          body: banner.body,
          data: toData(banner),
          sound: true,
          ...(banner.approval ? { categoryIdentifier: NOTIFICATIONS.approval.category } : {}),
        },
        trigger: { channelId: NOTIFICATIONS.channel.id },
      })
    } catch {
      // A banner that could not be posted is not worth failing over: the session's own row says
      // the same thing.
    }
  },

  /**
   * Takes a banner down, by its name: the one about a session (which is named after it) when the
   * person is looking at that session, or one whose question has been answered.
   */
  clear: async (banner: string): Promise<void> => {
    try {
      await Notifications.dismissNotificationAsync(banner)
    } catch {
      // There was none, or it was already gone.
    }
  },

  /**
   * Calls `answer` when one of a tool request's buttons is pressed with the app behind another or
   * closed, on Android: the system runs it in a task of the app's, with no screen, so it is set
   * up as the app's code loads (from its entry), before the system asks for it. iOS starts the
   * app out of sight instead, and the tap arrives the usual way (`onOpen`).
   */
  onBackgroundAnswer: (answer: (answered: BannerAnswered) => Promise<void>): void => {
    TaskManager.defineTask<Notifications.NotificationTaskPayload>(
      NOTIFICATIONS.task,
      async ({ data }) => {
        const answered = toAnswered(toResponseTarget(data))
        if (answered) await answer(answered)

        return Notifications.BackgroundNotificationTaskResult.NoData
      },
    )
    // Only Android runs a button's answer in the task; on iOS, which would need the app set up
    // for pushes that wake it, registering it would be for nothing.
    if (Platform.OS !== 'android') return
    void Notifications.registerTaskAsync(NOTIFICATIONS.task).catch(() => {
      // Without the task, a button pressed with the app closed is answered when it is next opened.
    })
  },

  /**
   * Calls `listener` with what a banner was about each time one is tapped, starting with the one
   * that opened the app, if one did; returns how to stop.
   */
  onOpen: (listener: (target: BannerTarget) => void): (() => void) => {
    const handle = (response: Notifications.NotificationResponse | null) => {
      const target = toResponseTarget(response)
      if (target) listener(target)
    }
    handle(Notifications.getLastNotificationResponse())
    // So the next to listen is not led to the same place again.
    Notifications.clearLastNotificationResponse()
    const subscription = Notifications.addNotificationResponseReceivedListener(handle)

    return () => subscription.remove()
  },
}
