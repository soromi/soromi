import { Session, type SessionLike, type SessionOptions } from './session'

/** What the transport layer needs: look up a session and list workspace names. */
export interface WorkspaceRegistry {
  get(workspace: string): SessionLike | undefined
  names(): string[]
}

/**
 * Owns the workspace-to-session map. One session per workspace (the daemon models
 * sessions as a list of length 1 internally; this map is that insurance).
 */
export class SessionManager implements WorkspaceRegistry {
  private readonly sessions = new Map<string, Session>()

  ensure(workspace: string, opts: SessionOptions): Session {
    const existing = this.sessions.get(workspace)
    if (existing) return existing
    const session = new Session(opts)
    this.sessions.set(workspace, session)
    return session
  }

  get(workspace: string): SessionLike | undefined {
    return this.sessions.get(workspace)
  }

  names(): string[] {
    return [...this.sessions.keys()]
  }

  dispose(workspace: string): void {
    const session = this.sessions.get(workspace)
    if (!session) return
    session.dispose()
    this.sessions.delete(workspace)
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose()
    this.sessions.clear()
  }
}
