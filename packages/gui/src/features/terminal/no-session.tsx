//Packages
import { sessionAgentFor, useClientStore, useTransport } from '@soromi/client'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { Ambient } from '@/shared/ambient'
import { SoromiMark } from '@/shared/soromi-mark'

//Types
import type { WorkspaceInfo } from '@soromi/client'

const PRIMARY =
  'inline-flex h-9 cursor-pointer appearance-none items-center gap-1.5 rounded-[9px] border-none bg-[var(--soromi-accent)] px-4 font-semibold text-[13px] text-[var(--soromi-accent-on)] transition-colors hover:bg-[var(--soromi-accent-hover)]'
const QUIET =
  'inline-flex h-9 cursor-pointer appearance-none items-center gap-1.5 rounded-[9px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-4 font-medium text-[13px] text-[var(--soromi-text-dim)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text)]'

/**
 * The main area while a workspace has no session open: the dotted ground fading out from the
 * middle, the mark, and the two ways on: a new session (a chat, under the workspace's first agent,
 * as the sidebar's row starts) or an earlier conversation carried on.
 */
export function NoSession({ workspace }: { workspace: WorkspaceInfo }) {
  const transport = useTransport()
  const openConversations = useAppStore((s) => s.openConversations)
  const count = workspace.sessions.length

  const start = () => {
    const accounts = useClientStore.getState().accounts
    const { agent, account } = sessionAgentFor(workspace.accounts, accounts, undefined)
    transport.send({
      type: 'open-session',
      workspace: workspace.name,
      agent,
      account,
      mode: 'chat',
    })
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Ambient focus="center" />
      <div className="relative flex max-w-[400px] flex-col items-center gap-4 px-6 text-center">
        <SoromiMark width={26} height={23} />
        <div>
          <h2 className="m-0 font-semibold text-[17px] text-[var(--soromi-text)] tracking-[-0.01em]">
            {count === 0 ? `Start in ${workspace.name}` : 'No session open'}
          </h2>
          <p className="m-0 mt-1.5 text-[13px] text-[var(--soromi-text-faint)] leading-[1.5]">
            {count === 0
              ? 'Start a session to give an agent its first task here, or carry on a conversation it had before.'
              : `Pick one of its ${count} ${count === 1 ? 'session' : 'sessions'} in the sidebar, start another, or carry on an earlier conversation.`}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" className={PRIMARY} onClick={start}>
            New session
          </button>
          <button type="button" className={QUIET} onClick={() => openConversations(workspace.name)}>
            Earlier conversations
          </button>
        </div>
      </div>
    </div>
  )
}
