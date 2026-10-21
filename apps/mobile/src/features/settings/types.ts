import type { ReactNode } from 'react'

export type SectionProps = {
  title: string
  children: ReactNode
}

export type UnpairProps = {
  /** Once the computer is forgotten: there is nothing left here to show. */
  onUnpaired: () => void
}

export type SettingsConfig = {
  /** What the button that opens the settings does, for a screen reader. */
  open: string
  computer: {
    title: string
    /** What the phone is paired for, above the way out of it. */
    about: string
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
