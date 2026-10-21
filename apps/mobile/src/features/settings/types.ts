import type { SegmentedOption } from '@/components'
import type { TextTone } from '@/config/theme'
import type { LinkStatus } from '@/states/link/link.state.type'
import type { DeviceRoute, Launcher } from '@soromi/protocol'
import type { ReactNode } from 'react'

export type SectionProps = {
  title: string
  children: ReactNode
}

/** What the relay box holds, as far as saving it goes. */
export type RelayDraft = {
  /** The address as it would be kept, or `null` when what is typed is not one. */
  url: string | null
  /** It is an address, and not the one in use. */
  changed: boolean
}

export type UnpairProps = {
  /** Once the computer is forgotten: there is nothing left here to show. */
  onUnpaired: () => void
}

/** How a round trip to the computer feels: quick, usable, or slow. */
export type LatencyGrade = 'good' | 'fair' | 'poor'

export type LatencySummary = {
  /** The latest round trip, in milliseconds. */
  last: number
  /** The average of the round trips kept. */
  average: number
  grade: LatencyGrade
}

export type StatProps = {
  label: string
  value: string
  /** The value's colour; the body colour when not given. */
  tone?: TextTone
}

export type SettingsConfig = {
  /** What the button that opens the settings does, for a screen reader. */
  open: string
  computer: {
    title: string
    /** What the phone is paired for, above the way out of it. */
    about: string
    /** The computer's system, by the name the daemon gives it. */
    os: Record<string, string>
    /** What runs the daemon there. */
    launcher: Record<Launcher, string>
    separator: string
    /** "Soromi 1.0.0": the computer's release. */
    version: (version: string) => string
  }
  connection: {
    title: string
    /** How often a round trip is timed while the view is open. */
    probeMs: number
    /** The slowest round trip, in milliseconds, that still counts as each grade. */
    grades: { good: number; fair: number }
    labels: {
      status: string
      route: string
      latency: string
      average: string
      since: string
      drops: string
    }
    status: Record<LinkStatus, string>
    route: Record<DeviceRoute, string>
    grade: Record<LatencyGrade, string>
    gradeTone: Record<LatencyGrade, TextTone>
    /** What is shown in place of a figure not known yet. */
    unknown: string
    ms: (ms: number) => string
    /** "84 ms · Good". */
    latency: (ms: number, grade: string) => string
    /** "average of 12". */
    average: (ms: number, count: number) => string
    drops: (count: number) => string
    duration: { seconds: string; minutes: string; hours: string }
  }
  appearance: {
    title: string
    /** Above the choice: what it does. */
    about: string
    options: SegmentedOption[]
  }
  relay: {
    title: string
    /** Above the box: what the relay is for, and when to change it. */
    about: string
    placeholder: string
    /** Under the box, while what is typed is not an address. */
    invalid: string
    save: string
    /** Once saved. */
    saved: string
  }
  unpair: {
    action: string
    /** Under the button: what it does and does not do. */
    hint: string
    title: string
    message: string
    cancel: string
    confirm: string
  }
}
