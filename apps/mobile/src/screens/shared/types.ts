//Type
import type { PanelView } from '@/features/panel/types'

export type PanelBodyProps = {
  session: string
  /** Which of the panel's views to show. Whoever shows the panel offers the way between them. */
  view: PanelView
}

export type PanelPaneProps = {
  session: string
  view: PanelView
  /** Beside the conversation, where there is room; over it, with the rest dimmed, where not. */
  docked: boolean
  onView: (view: PanelView) => void
  onClose: () => void
}
