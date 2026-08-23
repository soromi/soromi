import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

//Components
import { AgentsPanel } from './agents-panel'
import { Approval } from './approval'
import { ChatRow } from './chat-row'
import { Composer } from './composer'
import { ContextBanner } from './context-banner'
import { StreamingTail } from './streaming-tail'
import { WorkingIndicator } from './working-indicator'

//Logic
import { buildRows } from './rows'

//Types
import type {
  ChatEvent,
  ChatFile,
  PermissionMode,
  SlashCommand,
  SubAgent,
  ToolApproval,
} from '@soromi/protocol'

export interface ChatViewProps {
  /** The parsed transcript / stream events, newest last. */
  events: ChatEvent[]
  /** The assistant reply streaming in right now (cumulative text). Rendered as a live message at the
   * tail until the complete message lands in `events`. Empty/undefined means nothing is mid-stream. */
  streaming?: string
  /** The agent is mid-turn: shows a live working indicator (Claude's print mode rarely emits reasoning
   * text, so the turn's *state* is what tells the user it's alive). */
  working?: boolean
  /** Unix-ms timestamp the current turn started, so the working clock counts from the real start
   * (not this component's mount). Absent falls back to mount time. */
  workingSince?: number | null
  /** Disables the composer (e.g. this viewport doesn't hold control). */
  disabled?: boolean
  /** Composer placeholder. */
  placeholder?: string
  /** Shown centered when there are no events yet. Omit to render nothing. */
  emptyLabel?: string
  /** Sends a follow-up (with any pasted/attached files). The app decides the transport (terminal
   * input vs. a chat turn). */
  onSend: (text: string, files?: ChatFile[]) => void
  /** Interrupts the running turn (the composer's stop button, shown while `working`). */
  onStop?: () => void
  /** Sub-agents the agent is running this turn (`Task` calls); shown as a panel over the composer. */
  subagents?: SubAgent[]
  /** The provider's slash commands ("actions"), for the composer's `/` menu. Empty/absent hides it. */
  commands?: SlashCommand[]
  /** Tool calls awaiting the user's allow/deny (headless chat permission prompts). */
  approvals?: ToolApproval[]
  /** Answers an approval by its id. */
  onApproval?: (id: string, allow: boolean) => void
  /** The session's current permission mode, for the composer dropdown. */
  permissionMode?: PermissionMode
  /** Changes the permission mode. */
  onPermissionMode?: (mode: PermissionMode) => void
  /** The chat's model + reasoning effort, for the composer's model dropdown. */
  model?: string | null
  effort?: string | null
  /** Changes the model / effort. Absent hides the model dropdown. */
  onModel?: (model: string | null, effort: string | null) => void
  /** The account this session runs under (e.g. "bookr"), shown in the composer so it's clear which
   * provider login is active. `accountIcon` is the app-rendered provider glyph. */
  account?: string
  accountIcon?: ReactNode
  /** Context-window usage: current tokens and the model's limit, for the "context filling up" banner. */
  contextTokens?: number | null
  contextLimit?: number
  /** Runs a bare slash command in the session (`/compact`, `/clear`) — the context banner's actions. */
  onCommand?: (command: string) => void
  /** Keys the composer's unsent-text draft (the session id), so it survives switching chats. */
  draftKey?: string
  /** Earlier messages exist on the daemon beyond what's loaded (shows the "Load earlier" button). */
  canLoadEarlier?: boolean
  /** Requests the previous page of messages from the daemon (prepended to `events`). */
  onLoadEarlier?: () => void
}

/**
 * Presentational chat conversation + composer, shared by the desktop and web viewports. It renders an
 * agent's transcript as reflowing markdown, reasoning blocks, and tool cards (pairing each tool with
 * its result), a live working indicator while a turn runs, and a composer whose send action is
 * injected via `onSend` — terminal input for a PTY session, a chat turn for a headless one. All
 * store/transport wiring stays in each app's container. The rows, streaming tail, working indicator,
 * and composer are their own components/hooks (`./rows`, `./chat-row`, `./streaming-tail`,
 * `./working-indicator`, `./composer`); this file owns only the layout and scroll-follow behavior.
 */
export function ChatView({
  events,
  streaming,
  working = false,
  workingSince,
  disabled = false,
  placeholder = 'Reply to the agent…',
  emptyLabel,
  onSend,
  onStop,
  subagents,
  commands,
  approvals,
  onApproval,
  permissionMode = 'default',
  onPermissionMode,
  model,
  effort,
  onModel,
  account,
  accountIcon,
  contextTokens,
  contextLimit = 200_000,
  onCommand,
  draftKey,
  canLoadEarlier = false,
  onLoadEarlier,
}: ChatViewProps) {
  const rows = useMemo(() => buildRows(events), [events])
  const scrollRef = useRef<HTMLDivElement>(null)

  // A context command (`/compact` / `/clear`) in flight: disables the banner actions + the composer
  // and shows a spinner until the turn settles, so it can't be double-triggered (compaction is slow).
  const [commandPending, setCommandPending] = useState<'/compact' | '/clear' | null>(null)
  useEffect(() => {
    if (!working) setCommandPending(null)
  }, [working])
  const runCommand = onCommand
    ? (command: '/compact' | '/clear') => {
        setCommandPending(command)
        onCommand(command)
      }
    : undefined
  // The streaming reply (paced by a ~40×/sec timer) and the working clock (1×/sec) live in their own
  // isolated children — `StreamingTail` and `WorkingIndicator` — so their frequent ticks re-render
  // just those nodes, not this whole view and every committed row.

  // "Load earlier" prepends a page from the daemon. Anchor by distance-from-bottom so the view holds
  // its place when older messages land above (`null` = no pending load).
  const pendingAnchor = useRef<number | null>(null)
  const requestEarlier = () => {
    const node = scrollRef.current
    pendingAnchor.current = node ? node.scrollHeight - node.scrollTop : null
    onLoadEarlier?.()
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a prepend grows the list.
  useLayoutEffect(() => {
    if (pendingAnchor.current == null) return
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight - pendingAnchor.current
    pendingAnchor.current = null
  }, [rows.length])

  // Stick to the bottom as the conversation grows. A ResizeObserver on the content catches *any*
  // height change — new blocks, streaming text, Shiki filling in async — not just row-count changes,
  // which is why the follow used to stall. `stick` tracks whether we should keep following: the user
  // detaches by scrolling up and re-attaches by scrolling back near the bottom. Our own scrolls are
  // marked `programmatic` so the smooth animation's own scroll events don't get read as "user
  // scrolled away". The first fit is instant (land on the newest message); the rest smooth-follow.
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const programmatic = useRef(false)
  // When this pane mounted. Opening a chat (or switching back to one) lays the transcript out in
  // several steps as markdown and Shiki highlighting fill in async; we jump to the bottom instantly
  // during this settling window so a freshly opened chat lands on the latest message with no visible
  // scroll animation. After it, only genuinely new content smooth-scrolls.
  const mountedAt = useRef(Date.now())
  const SETTLE_MS = 1000

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const node = scrollRef.current
    if (!node) return
    programmatic.current = true
    node.scrollTo({ top: node.scrollHeight, behavior })
  }

  const onScroll = () => {
    const node = scrollRef.current
    if (!node) return
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    if (programmatic.current) {
      // Ignore our own scroll until it reaches the bottom, so it can't detach mid-animation.
      if (distance < 4) programmatic.current = false
      return
    }
    stick.current = distance < 60
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — the observer reads live refs, not props/state.
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (pendingAnchor.current != null || !stick.current) return
      const settling = Date.now() - mountedAt.current < SETTLE_MS
      scrollToBottom(settling ? 'auto' : 'smooth')
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    // Esc interrupts a running turn (like Claude Code's terminal) — cancel and move on. The slash
    // menu consumes Esc first (to dismiss), so it only interrupts when the menu is closed.
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard shortcut scoped to the chat.
    <div
      className="absolute inset-0 flex flex-col bg-[var(--soromi-bg-terminal)] text-[var(--soromi-text)] antialiased"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && working && onStop) {
          event.preventDefault()
          onStop()
        }
      }}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto [-webkit-overflow-scrolling:touch]"
      >
        {/* A centered reading column (like Synara), so lines don't stretch edge-to-edge on a wide
            window. The scroll container stays full width so the scrollbar sits at the window edge. */}
        <div
          ref={contentRef}
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-2 px-4 py-4"
        >
          {rows.length === 0 && !working && emptyLabel ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-[var(--soromi-text-faint)] leading-[1.5]">
              {emptyLabel}
            </div>
          ) : (
            <>
              {canLoadEarlier && (
                <button
                  type="button"
                  onClick={requestEarlier}
                  className="mx-auto cursor-pointer appearance-none rounded-full border border-[var(--soromi-border)] bg-transparent px-3 py-1 font-medium text-[12px] text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
                >
                  Load earlier messages
                </button>
              )}
              {rows.map((row) => (
                <ChatRow key={row.key} row={row} />
              ))}
            </>
          )}
          <StreamingTail text={streaming?.trim() ? streaming : ''} />
          {working && !approvals?.length && <WorkingIndicator since={workingSince} />}
          {approvals?.map((approval) => (
            <Approval
              key={approval.id}
              approval={approval}
              onAllow={() => onApproval?.(approval.id, true)}
              onDeny={() => onApproval?.(approval.id, false)}
            />
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 pt-1 pb-3">
        {contextTokens != null && runCommand && (
          <ContextBanner
            tokens={contextTokens}
            limit={contextLimit}
            busy={commandPending !== null}
            pending={commandPending}
            onCompact={() => runCommand('/compact')}
            onClear={() => runCommand('/clear')}
          />
        )}
        <AgentsPanel subagents={subagents ?? []} onStop={onStop} />
        <Composer
          disabled={disabled || commandPending !== null}
          disabledLabel={
            commandPending === '/compact'
              ? 'Compacting…'
              : commandPending === '/clear'
                ? 'Clearing…'
                : undefined
          }
          working={working}
          placeholder={placeholder}
          onSend={onSend}
          onStop={onStop}
          commands={commands ?? []}
          permissionMode={permissionMode}
          onPermissionMode={onPermissionMode}
          model={model}
          effort={effort}
          onModel={onModel}
          account={account}
          accountIcon={accountIcon}
          draftKey={draftKey}
        />
      </div>
    </div>
  )
}
