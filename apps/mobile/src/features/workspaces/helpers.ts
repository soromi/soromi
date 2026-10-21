import {
  DEFAULT_ACCOUNT,
  SETUP_AGENTS,
  agentLabel,
  basename,
  boundAccounts,
  workspaceFolderPaths,
} from '@soromi/core'

//Config
import { routes } from '@/config/router'

//Type
import type { WorkspaceEdit } from '@soromi/core'
import type { AccountProfile, WorkspaceSummary } from '@soromi/protocol'
import type { Href } from 'expo-router'
import type { Choice } from './types'

/** Where a new workspace is set up. */
export const getNewWorkspaceHref = (): Href => routes.app.newWorkspace

/** A folder inside another, by its name. */
export const getChildPath = (parent: string, name: string): string =>
  parent === '/' ? `/${name}` : `${parent.replace(/\/+$/, '')}/${name}`

/** The folders with one more, unless it is already there (a trailing slash makes no difference). */
export const withFolder = (folders: string[], path: string): string[] => {
  const clean = (folder: string) => folder.replace(/\/+$/, '') || '/'

  return folders.some((folder) => clean(folder) === clean(path)) ? folders : [...folders, path]
}

export const withoutFolder = (folders: string[], path: string): string[] =>
  folders.filter((folder) => folder !== path)

/** The agents a workspace can be set up with, as choices. */
export const getAgentChoices = (): Choice[] =>
  SETUP_AGENTS.map((agent) => ({ value: agent, label: agentLabel(agent) }))

export const toChoices = (values: string[]): Choice[] =>
  values.map((value) => ({ value, label: value }))

/** The accounts an agent could be bound to besides the ones it is: those that configure it. */
export const getSpareAccounts = (
  profiles: AccountProfile[],
  agent: string,
  chosen: string[],
): string[] =>
  profiles
    .filter((profile) => agent in profile.providers && !chosen.includes(profile.name))
    .map((profile) => profile.name)

/** An agent bound to one more account, after the ones it has. */
export const withAccount = (
  bindings: Record<string, string[]>,
  agent: string,
  account: string,
): Record<string, string[]> => {
  const chosen = bindings[agent] ?? [DEFAULT_ACCOUNT]
  if (chosen.includes(account)) return bindings

  return { ...bindings, [agent]: [...chosen, account] }
}

/** An agent no longer bound to an account. One is always left: the default, if none else. */
export const withoutAccount = (
  bindings: Record<string, string[]>,
  agent: string,
  account: string,
): Record<string, string[]> => {
  const rest = (bindings[agent] ?? []).filter((one) => one !== account)

  return { ...bindings, [agent]: rest.length > 0 ? rest : [DEFAULT_ACCOUNT] }
}

/** What a workspace made of these folders is called when no name is given. */
export const getDefaultName = (folders: string[]): string =>
  folders.length === 1 ? basename(folders[0]) : ''

/** What a workspace's settings start from: how it is set up now, as the form edits it. */
export const toWorkspaceEdit = (
  summary: WorkspaceSummary,
  name: string,
  agents: string[],
): WorkspaceEdit => ({
  name,
  folders: workspaceFolderPaths(summary),
  bindings: Object.fromEntries(agents.map((agent) => [agent, boundAccounts(summary, agent)])),
  instructions: summary.instructions ?? '',
})

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index])

/** Whether the form says anything other than what it started from: what there is to save. */
export const isEdited = (start: WorkspaceEdit, edit: WorkspaceEdit): boolean => {
  if (start.name.trim() !== edit.name.trim()) return true
  if (start.instructions.trim() !== edit.instructions.trim()) return true
  if (!sameList(start.folders, edit.folders)) return true
  const agents = new Set([...Object.keys(start.bindings), ...Object.keys(edit.bindings)])

  return [...agents].some(
    (agent) => !sameList(start.bindings[agent] ?? [], edit.bindings[agent] ?? []),
  )
}
