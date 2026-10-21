/**
 * How the app lays itself out by the width it is given. A phone gets one thing at a time, full
 * width; a tablet (or a large phone on its side) gets columns, as the desktop has.
 */
export const layout = {
  breakpoints: {
    /** From here up the sessions stay in a column of their own beside whatever is open. */
    wide: 768,
    /** From here up a session's panel sits beside the conversation; below, it slides over it. */
    docked: 1100,
  },
  /**
   * The height of the row at the top of each column of a wide screen (the sessions', a session's,
   * its panel's), below the status bar. One height, so what is in them lines up across columns.
   */
  header: 52,
  /** The width of the sessions column. */
  sidebar: 320,
  /** The width of a session's panel (files, skills, changes) when it is beside the conversation. */
  panel: 380,
  /** The widest a conversation's column grows: past this, lines are too long to read. */
  column: 820,
  /** The widest a sheet grows, however wide the screen. */
  sheet: 520,
  /** The least room a session's card takes in the home's grid: what decides how many fit a row. */
  card: 170,
  /**
   * How far the two columns can be dragged wider or narrower, as on the desktop. The sessions
   * column takes at most a share of the window; a docked panel leaves the conversation at least
   * `content` of it, and one over the conversation leaves `gap` of it showing to tap away.
   */
  resize: {
    sidebar: { min: 240, max: 480, share: 0.4 },
    panel: { min: 300, max: 640 },
    content: 360,
    gap: 48,
    /** How much a screen reader's swipe up or down moves an edge. */
    step: 40,
  },
} as const
