import * as Notifications from 'expo-notifications'

//Constants
import { NOTIFICATIONS } from './notifications.constants'

//Helpers
import { getBannerId, toData, toTarget } from './notifications.helpers'

//Type
import type { Banner, BannerTarget } from './notifications.type'

/**
 * The phone's notifications, which come two ways. While the app is on screen, the computer tells
 * it of a banner over the link and the app posts it itself. While it is not, the computer hands
 * the banner to a push service, which reaches the phone through Apple or Google; the system shows
 * that one without the app running. This is the only place that imports the notifications module.
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
        content: { title: banner.title, body: banner.body, data: toData(banner), sound: true },
        trigger: { channelId: NOTIFICATIONS.channel.id },
      })
    } catch {
      // A banner that could not be posted is not worth failing over: the session's own row says
      // the same thing.
    }
  },

  /** Takes down the banner about a session: the person is looking at it now. */
  clear: async (session: string): Promise<void> => {
    try {
      await Notifications.dismissNotificationAsync(session)
    } catch {
      // There was none, or it was already gone.
    }
  },

  /**
   * Calls `listener` with what a banner was about each time one is tapped, starting with the one
   * that opened the app, if one did; returns how to stop.
   */
  onOpen: (listener: (target: BannerTarget) => void): (() => void) => {
    const handle = (response: Notifications.NotificationResponse | null) => {
      const target = toTarget(response?.notification.request.content.data)
      if (target) listener(target)
    }
    handle(Notifications.getLastNotificationResponse())
    // So the next to listen is not led to the same place again.
    Notifications.clearLastNotificationResponse()
    const subscription = Notifications.addNotificationResponseReceivedListener(handle)

    return () => subscription.remove()
  },
}
