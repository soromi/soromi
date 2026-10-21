import type { DeviceRoute } from '@soromi/protocol'
import type { ReactElement, ReactNode } from 'react'

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

/** One thing in a header, as iOS takes it: any element, with or without the system's glass behind. */
export type HeaderItem = {
  type: 'custom'
  element: ReactElement
  hidesSharedBackground: boolean
}

/** The part of a screen's options that puts something at the right of its header. */
export type HeaderActions = {
  headerRight: () => ReactElement | null
  /** iOS only, where it takes the place of `headerRight`. */
  unstable_headerRightItems?: () => HeaderItem[]
}

export type ScreenHeaderProps = {
  title: string
  /** Something before the title: the mark of the provider a session runs under, say. */
  leading?: ReactNode
  /** What sits at the right: the screen's actions. */
  children?: ReactNode
}

/** What the navigator is told about one screen. */
export type ScreenOptions = {
  title: string
}

export type NavigationConfig = {
  /** How a screen arrives: sliding in on a phone, in place beside the sessions column. */
  animation: {
    narrow: 'default'
    wide: 'none'
  }
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
