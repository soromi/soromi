//Type
import type { RouteTree } from '@/types/navigation'

/** Single source of truth for every navigable route. Links and redirects use these, never a string. */
export const routes = {
  /** Everything that needs the phone to be paired with a computer. */
  app: {
    sessions: '/',
    settings: '/settings',
    /** Patterns: each is filled by a helper in the feature that links to it. */
    session: '/session/[id]',
    panel: '/session/[id]/panel',
    agent: '/session/[id]/agent',
    newWorkspace: '/workspace/new',
    workspace: '/workspace/[name]/sessions',
    workspaceSettings: '/workspace/[name]/settings',
    conversations: '/workspace/[name]/conversations',
    usage: '/workspace/[name]/usage',
    file: '/workspace/[name]/file',
    diff: '/workspace/[name]/diff',
  },
  pairing: {
    pair: '/pair',
  },
} as const satisfies RouteTree
