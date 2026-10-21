export type PanelBodyProps = {
  session: string
}

export type PanelPaneProps = {
  session: string
  /** Beside the conversation, where there is room; over it, with the rest dimmed, where not. */
  docked: boolean
  onClose: () => void
}
