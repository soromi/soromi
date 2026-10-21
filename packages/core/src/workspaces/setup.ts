//Utils
import { basename, deriveRootAndFolders } from './folders'

//Types
import type {
  AccountProfile,
  AgentAccount,
  ClientMessage,
  WorkspaceSummary,
} from '@soromi/protocol'

/** The agents a workspace can be set up with, in the order they are offered. */
export const SETUP_AGENTS = ['claude', 'codex', 'grok'] as const

/** The account an agent runs under when none was set up for it: the computer user's own login. */
export const DEFAULT_ACCOUNT = 'personal'

/** The accounts an agent can run under: the default one, then every profile that configures it. */
export function accountChoices(profiles: AccountProfile[], agent: string): string[] {
  return [
    ...new Set([
      DEFAULT_ACCOUNT,
      ...profiles.filter((p) => agent in p.providers).map((p) => p.name),
    ]),
  ]
}

/** What a new workspace is made of, as the form holding it has it. */
export interface NewWorkspace {
  /** What to call it; empty, it is named after its root folder. */
  name: string
  /** The folders it is made of, absolute. */
  folders: string[]
  agent: string
  account: string
}

/**
 * The message that creates a workspace from what a form holds: its root is the folders' common
 * parent (one folder is its own root, whole), and each folder is relative to it.
 */
export function createSpaceMessage(form: NewWorkspace): ClientMessage | null {
  const { root, folders } = deriveRootAndFolders(form.folders)
  if (!root) return null
  const whole = folders.length === 1 && folders[0] === '.'
  return {
    type: 'create-space',
    name: form.name.trim() || basename(root),
    root,
    agent: form.agent.trim() || SETUP_AGENTS[0],
    account: form.account.trim() || DEFAULT_ACCOUNT,
    folders: whole ? undefined : folders,
  }
}

/** A workspace's folders as absolute paths, the way its settings show and edit them. */
export function workspaceFolderPaths(summary: WorkspaceSummary): string[] {
  return summary.folders.map((folder) =>
    folder === '.' ? summary.root : `${summary.root}/${folder}`,
  )
}

/** The agents a workspace's settings list: every one that can be set up, then any it binds besides. */
export function settingsAgents(summary: WorkspaceSummary | undefined): string[] {
  return [...new Set([...SETUP_AGENTS, ...(summary?.accounts.map((a) => a.agent) ?? [])])]
}

/**
 * The accounts a workspace binds to an agent, in order: its tabs run under the first, and a tab
 * can be moved to any of the others. An agent bound to none shows the default account.
 */
export function boundAccounts(summary: WorkspaceSummary | undefined, agent: string): string[] {
  const bound = summary?.accounts.filter((a) => a.agent === agent).map((a) => a.id) ?? []
  return bound.length > 0 ? bound : [DEFAULT_ACCOUNT]
}

/** A workspace's settings as a form holds them. */
export interface WorkspaceEdit {
  name: string
  folders: string[]
  /** The accounts each agent is bound to, in order. */
  bindings: Record<string, string[]>
  instructions: string
}

/**
 * The message that saves a workspace's settings. A binding to an account that does not configure
 * its agent is left out: the form shows every agent with the default account, and saving any
 * change (a folder, the name) must not bind every provider to an account it cannot run under.
 */
export function updateSpaceMessage(
  workspace: WorkspaceSummary,
  edit: WorkspaceEdit,
  profiles: AccountProfile[],
): ClientMessage {
  const accounts: AgentAccount[] = Object.entries(edit.bindings)
    .flatMap(([agent, ids]) => ids.map((id) => ({ id, agent })))
    .filter((b) => profiles.find((p) => p.name === b.id)?.providers?.[b.agent] != null)
  const { root, folders } = deriveRootAndFolders(edit.folders)
  const name = edit.name.trim()
  return {
    type: 'update-space',
    workspace: workspace.name,
    name: name && name !== workspace.name ? name : undefined,
    accounts,
    folders,
    root,
    instructions: edit.instructions.trim() || undefined,
  }
}
