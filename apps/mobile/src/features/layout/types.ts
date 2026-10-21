import type { DeviceRoute } from '@soromi/protocol'

//Components
import type { IconName } from '@/components'

//Type
import type { LinkStatus } from '@/states/link/link.state.type'

/** A link state the banner speaks about: every one but being online. */
export type OfflineStatus = Exclude<LinkStatus, 'online'>

export type LinkConfig = {
  /** What to tell the user, by state. */
  messages: Record<OfflineStatus, string>
  /** The states the user can act on, and what the button says. */
  actions: Partial<Record<OfflineStatus, string>>
  /** How each route to the computer is named while it is the one in use. */
  routes: Record<DeviceRoute, { label: string; icon: IconName }>
}

export type ControlConfig = {
  /** Before the name of the device in control. */
  lead: string
  /** After it. */
  trail: string
  takeOver: string
}

/** What the navigator is told about one screen. */
export type ScreenOptions = {
  title: string
}

export type NavigationConfig = {
  screens: {
    sessions: ScreenOptions
    settings: ScreenOptions
    pair: ScreenOptions
    /** Titled by the screen itself, once it knows what it shows. */
    session: ScreenOptions
    /** Titled by the screen itself: the workspace the session belongs to. */
    panel: ScreenOptions
    file: ScreenOptions
    diff: ScreenOptions
  }
}
