export const LINK = {
  /**
   * What is asked of the daemon each time the link opens: the workspaces and their sessions, every
   * provider's models, and the account profiles (which agents a workspace can really run).
   */
  onOpen: ['list-workspaces', 'list-models', 'list-accounts'],
} as const
