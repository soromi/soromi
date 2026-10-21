//Constants
import { PANEL } from './constants/panel'

//Type
import type { PanelView } from './types'

/** The view a route names, or the one the panel opens on when it names none it knows. */
export const toPanelView = (value: string | undefined): PanelView =>
  PANEL.views.find((view) => view.id === value)?.id ?? PANEL.initial
