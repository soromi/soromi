//Components
import type { SegmentedOption } from '@/components'

/** The views of the panel beside a session: what the desktop keeps in its side panel. */
export type PanelView = 'files' | 'skills' | 'git' | 'terminal'

export type PanelConfig = {
  /** The views, in the order they are offered. */
  views: Array<SegmentedOption & { id: PanelView }>
  /** The one the panel opens on. */
  initial: PanelView
  /** What a tap beside the panel does, for a screen reader. */
  close: string
}
