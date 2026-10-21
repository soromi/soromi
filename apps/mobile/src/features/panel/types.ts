//Components
import type { IconName, SegmentedOption } from '@/components'

/** The views of the panel beside a session: what the desktop keeps in its side panel. */
export type PanelView = 'files' | 'skills' | 'git' | 'terminal'

/** One of the panel's views, as it is offered: its name is read out, its icon is shown. */
export type PanelViewOption = SegmentedOption & { id: PanelView; icon: IconName }

export type TabsProps = {
  /** The view on screen, which is marked; none is, where the panel is not open. */
  active: PanelView | null
  onSelect: (view: PanelView) => void
}

export type TabProps = {
  option: PanelViewOption
  active: boolean
  onSelect: (view: PanelView) => void
}

export type PanelConfig = {
  /** The views, in the order they are offered. */
  views: PanelViewOption[]
  /** The one the panel opens on. */
  initial: PanelView
  /** What a tap beside the panel does, for a screen reader. */
  close: string
}
