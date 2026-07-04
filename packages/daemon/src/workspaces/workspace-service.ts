import { mkdirSync, statSync } from 'node:fs'
import { basename } from 'node:path'

//
import { loadAccountProfile } from '../accounts/account-loader'
import { resolveLaunchEnv } from '../accounts/account-resolver'
import { listDirectory } from '../files/directory'
import { type FileRead, readFileWithin } from '../files/file-reader'
import { SessionManager } from '../sessions/session-manager'
import { parseAgentCommand } from './agent-command'
import { type PersistedSpace, loadSpaces, saveSpaces } from './space-store'
import { loadWorkspace } from './workspace-loader'

//Types
import type { DirEntry, WorkspaceSummary } from '@soromi/protocol'
import type { NotificationController } from '../notifications/notification-controller'
import type { SessionLike } from '../sessions/session'
import type { WorkspaceRegistry } from '../sessions/session-manager'

type WorkspaceMeta = Omit<PersistedSpace, 'name'>

export interface CreateSpaceInput {
  name: string
  root: string
  agent: string
  account: string
  folders?: string[]
}

export interface OpenResult {
  workspace: string
  /** Set when the space opened but its account could not be applied. */
  warning?: string
}

/** The daemon core the transport talks to: create/open/remove spaces, look them up, watch. */
export interface WorkspaceHub extends WorkspaceRegistry {
  createSpace(input: CreateSpaceInput): OpenResult
  openWorkspace(dir: string): OpenResult
  removeSpace(name: string): void
  summaries(): WorkspaceSummary[]
  listDir(workspace: string, path: string): DirEntry[]
  readFile(workspace: string, path: string): FileRead
  setMuted(workspace: string, muted: boolean): void
  onChange(listener: () => void): () => void
}

/**
 * Creates and owns spaces. Spaces are created in-app and persisted under `~/.soromi/`, so
 * they restore when the daemon restarts. A `soromi.space.json` is optional: `openWorkspace`
 * imports one into a persisted space. A missing account profile is non-fatal (runs under
 * the base env with a warning).
 */
export class WorkspaceService implements WorkspaceHub {
  private readonly manager = new SessionManager()
  private readonly metadata = new Map<string, WorkspaceMeta>()
  private readonly changeListeners = new Set<() => void>()

  constructor(private readonly notifications: NotificationController) {
    for (const space of loadSpaces()) this.spawnSpace(space)
  }

  createSpace(input: CreateSpaceInput): OpenResult {
    if (this.manager.get(input.name)) return { workspace: input.name }
    if (!isDirectory(input.root)) throw new Error(`folder not found: ${input.root}`)

    const folders = input.folders && input.folders.length > 0 ? input.folders : ['.']
    const warning = this.spawnSpace({
      name: input.name,
      root: input.root,
      folders,
      agent: input.agent,
      account: input.account,
    })
    this.persist()
    this.emitChange()
    return { workspace: input.name, warning }
  }

  openWorkspace(dir: string): OpenResult {
    const { workspace, root } = loadWorkspace(dir)
    return this.createSpace({
      name: workspace.name,
      root,
      agent: workspace.agent,
      account: workspace.account,
      folders: workspace.folders,
    })
  }

  removeSpace(name: string): void {
    if (!this.metadata.has(name)) return
    this.manager.dispose(name)
    this.metadata.delete(name)
    this.persist()
    this.emitChange()
  }

  get(name: string): SessionLike | undefined {
    return this.manager.get(name)
  }

  names(): string[] {
    return this.manager.names()
  }

  summaries(): WorkspaceSummary[] {
    return [...this.metadata].map(([name, meta]) => ({
      name,
      status: this.manager.get(name)?.status() ?? 'idle',
      agent: meta.agent,
      account: meta.account,
      folders: meta.folders,
    }))
  }

  listDir(workspace: string, path: string): DirEntry[] {
    const meta = this.metadata.get(workspace)
    if (!meta) return []
    return listDirectory(meta.root, meta.folders, path)
  }

  readFile(workspace: string, path: string): FileRead {
    const meta = this.metadata.get(workspace)
    if (!meta) return { content: '', truncated: false, binary: false }
    return readFileWithin(meta.root, path)
  }

  setMuted(workspace: string, muted: boolean): void {
    this.notifications.setMuted(workspace, muted)
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  dispose(): void {
    this.manager.disposeAll()
    this.metadata.clear()
  }

  /** Spawns a session for a space and records its metadata. Returns an account warning. */
  private spawnSpace(space: PersistedSpace): string | undefined {
    const { command, args } = parseAgentCommand(space.agent)

    let env = process.env
    let warning: string | undefined
    try {
      const profile = loadAccountProfile(space.account)
      const resolved = resolveLaunchEnv(profile, basename(command), process.env)
      for (const configDir of resolved.ensureDirs) mkdirSync(configDir, { recursive: true })
      env = resolved.env
    } catch {
      warning = `account "${space.account}" is not configured; running under the default environment`
    }

    const session = this.manager.ensure(space.name, { command, args, cwd: space.root, env })
    session.onStatus((status) => this.notifications.handle(space.name, status))
    this.metadata.set(space.name, {
      agent: space.agent,
      account: space.account,
      folders: space.folders,
      root: space.root,
    })
    return warning
  }

  private persist(): void {
    saveSpaces(
      [...this.metadata].map(([name, meta]) => ({
        name,
        root: meta.root,
        folders: meta.folders,
        agent: meta.agent,
        account: meta.account,
      })),
    )
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) listener()
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
