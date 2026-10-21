//Config
import { layout } from '@/config/layout'

/** A width kept between two others. */
export const clampWidth = (width: number, min: number, max: number): number =>
  Math.min(Math.max(width, min), Math.max(min, max))

/** The widest the sessions column can be dragged in a window this wide. */
export const getSidebarMax = (window: number): number => {
  const { min, max, share } = layout.resize.sidebar

  return Math.max(min, Math.min(max, Math.floor(window * share)))
}

/**
 * The widest a session's panel can be dragged: beside the conversation, as much as leaves it room
 * to read; over it, as much as leaves a strip of it to tap away.
 */
export const getPanelMax = (window: number, sidebar: number, docked: boolean): number => {
  const { min, max } = layout.resize.panel
  const room = docked
    ? window - sidebar - layout.resize.content
    : window - sidebar - layout.resize.gap

  return Math.max(min, Math.min(max, room))
}
