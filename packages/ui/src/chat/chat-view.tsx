import { Paperclip } from 'lucide-react'
import {
  type CSSProperties,
  type MouseEvent,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

//Components
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '../components/ai-elements/prompt-input'
import { Shimmer } from '../components/ai-elements/shimmer'
import { Approval } from './approval'
import { Markdown } from './markdown'
import { PermissionSelect } from './permission-select'
import { Reasoning } from './reasoning'
import { ToolCall } from './tool-call'
import { ToolGroup } from './tool-group'
import { WorkingMark } from './working-mark'

//Types
import type { PromptInputMessage } from '../components/ai-elements/prompt-input'
import type { ToolItem, ToolResult } from './tool-call'
import type { ChatEvent, ChatFile, PermissionMode, ToolApproval } from '@soromi/protocol'

// Consecutive tool calls at or above this count collapse into one expandable group; fewer render
// inline so a quick 1-2 step read still shows at a glance.
const GROUP_MIN = 3

type Row =
  | { key: string; kind: 'user' | 'assistant' | 'thinking' | 'notice'; text: string }
  | { key: string; kind: 'tool'; tool: ToolItem }
  | { key: string; kind: 'tool-group'; tools: ToolItem[] }

export interface ChatViewProps {
  /** The parsed transcript / stream events, newest last. */
  events: ChatEvent[]
  /** The assistant reply streaming in right now (cumulative text). Rendered as a live message at the
   * tail until the complete message lands in `events`. Empty/undefined means nothing is mid-stream. */
  streaming?: string
  /** The agent is mid-turn: shows a live working indicator (Claude's print mode rarely emits reasoning
   * text, so the turn's *state* is what tells the user it's alive). */
  working?: boolean
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
  /** Tool calls awaiting the user's allow/deny (headless chat permission prompts). */
  approvals?: ToolApproval[]
  /** Answers an approval by its id. */
  onApproval?: (id: string, allow: boolean) => void
  /** The session's current permission mode, for the composer dropdown. */
  permissionMode?: PermissionMode
  /** Changes the permission mode. */
  onPermissionMode?: (mode: PermissionMode) => void
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
 * store/transport wiring stays in each app's container.
 */
export function ChatView({
  events,
  streaming,
  working = false,
  disabled = false,
  placeholder = 'Reply to the agent…',
  emptyLabel,
  onSend,
  onStop,
  approvals,
  onApproval,
  permissionMode = 'default',
  onPermissionMode,
  canLoadEarlier = false,
  onLoadEarlier,
}: ChatViewProps) {
  const rows = useMemo(() => buildRows(events), [events])
  const scrollRef = useRef<HTMLDivElement>(null)
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
  const firstFit = useRef(true)

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

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (pendingAnchor.current != null || !stick.current) return
      scrollToBottom(firstFit.current ? 'auto' : 'smooth')
      firstFit.current = false
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--soromi-bg-terminal)] text-[var(--soromi-text)] antialiased">
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
          {working && !approvals?.length && <WorkingIndicator />}
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
        <Composer
          disabled={disabled}
          working={working}
          placeholder={placeholder}
          onSend={onSend}
          onStop={onStop}
          permissionMode={permissionMode}
          onPermissionMode={onPermissionMode}
        />
      </div>
    </div>
  )
}

// Whimsical status words that cycle while a turn runs (à la Claude Code's spinner). Ours, not theirs.
const WORKING_WORDS = [
  'Thinking',
  'Working',
  'Pondering',
  'Crunching',
  'Reasoning',
  'Digging in',
  'Noodling',
  'Cooking',
  'Untangling',
  'Percolating',
  'Synthesizing',
  'Mulling',
  'Scheming',
  'Wrangling',
]

/** Cycles the working word every few seconds, starting on a random one so each turn reads differently. */
function useWorkingWord(): string {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * WORKING_WORDS.length))
  useEffect(() => {
    const id = setInterval(() => setIndex((n) => (n + 1) % WORKING_WORDS.length), 3500)
    return () => clearInterval(id)
  }, [])
  return WORKING_WORDS[index]
}

/**
 * Live "agent is working" indicator: an accent icon plus a shimmering, cycling status word and the
 * running seconds — the way Claude Code rotates its spinner words. The `--color-background` override
 * flips the AI Elements Shimmer's sweep to a light highlight, since our app background is dark.
 */
function WorkingIndicator() {
  const word = useWorkingWord()
  // Owns its own second timer so the running clock re-renders only this indicator, not the whole view.
  const elapsed = useElapsed(true)
  return (
    <div
      className="flex items-center gap-2 py-1 text-[13px] leading-none"
      style={{ '--color-background': 'var(--soromi-text)' } as CSSProperties}
    >
      <WorkingMark size={11} />
      <Shimmer duration={1.6}>{word}</Shimmer>
      <span className="text-[var(--soromi-text-faint)] tabular-nums">· {elapsed}s</span>
    </div>
  )
}

// Memoized: `rows` (and each `row` object) are referentially stable while a turn streams — only the
// live delta changes, not `events` — so a re-render of `ChatView` (which happens on every delta,
// since `streaming` is a prop) skips every committed row instead of re-parsing all their markdown.
const ChatRow = memo(function ChatRow({ row }: { row: Row }) {
  if (row.kind === 'tool') {
    return <ToolCall {...row.tool} />
  }
  if (row.kind === 'tool-group') {
    return <ToolGroup tools={row.tools} />
  }
  if (row.kind === 'thinking') {
    return <Reasoning text={row.text} />
  }
  if (row.kind === 'notice') {
    // A system event (e.g. a stopped turn), tagged by the daemon — a centered marker, not a bubble.
    return (
      <div className="my-1 flex items-center justify-center gap-2.5 text-[11.5px] text-[var(--soromi-text-faint)]">
        <span className="h-px w-8 bg-[var(--soromi-border)]" />
        {row.text.replace(/^\[|\]$/g, '') || 'Interrupted'}
        <span className="h-px w-8 bg-[var(--soromi-border)]" />
      </div>
    )
  }
  if (row.kind === 'user') {
    return (
      <div className="max-w-[85%] self-end rounded-2xl bg-[var(--soromi-bg-active)] px-3.5 py-2">
        <Markdown>{row.text}</Markdown>
      </div>
    )
  }
  return <Markdown>{row.text}</Markdown>
})

/**
 * The live assistant reply, paced to type out steadily. Owns the smoothing timer, so its frequent
 * (~40×/sec) updates re-render only this node instead of the whole ChatView and every committed row.
 */
function StreamingTail({ text }: { text: string }) {
  const revealed = useSmoothText(text)
  if (!revealed) return null
  return <Markdown incomplete>{revealed}</Markdown>
}

/**
 * Reveals `target` at a steady typing cadence instead of jumping to each new chunk. It only ever adds
 * characters toward the current target; a fresh message (target no longer a superset of what's shown)
 * resets, and the step scales with how far behind it is so it keeps up with fast bursts without ever
 * dumping a whole line at once.
 */
function useSmoothText(target: string): string {
  const [shown, setShown] = useState('')
  const targetRef = useRef('')

  useEffect(() => {
    targetRef.current = target
    setShown((current) => (target.startsWith(current) ? current : ''))
  }, [target])

  useEffect(() => {
    if (shown === target && target.startsWith(shown)) return
    const id = setTimeout(() => {
      setShown((current) => {
        const goal = targetRef.current
        if (!goal.startsWith(current)) return ''
        if (current.length >= goal.length) return goal
        const step = Math.max(3, Math.ceil((goal.length - current.length) / 6))
        return goal.slice(0, current.length + step)
      })
    }, 24)
    return () => clearTimeout(id)
  }, [shown, target])

  return shown
}

/** Seconds elapsed since `active` last became true; resets to 0 when it goes false. */
function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    setElapsed(0)
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [active])
  return elapsed
}

// Stable, position-independent row keys: keyed by the event object's identity (the store reuses event
// object references across both append and "load earlier" prepend), so prepending older messages
// doesn't shift array indices and remount — and re-highlight — the entire list.
let keySeq = 0
const rowKeys = new WeakMap<object, string>()
function rowKey(event: ChatEvent): string {
  let key = rowKeys.get(event)
  if (!key) {
    key = `r${keySeq++}`
    rowKeys.set(event, key)
  }
  return key
}

/**
 * Builds render rows: tool results fold into their call (matched by id); a run of consecutive tool
 * calls collapses into one `tool-group` (expandable) once it reaches `GROUP_MIN`, so a long read/grep
 * burst stays tidy; shorter runs and everything else map straight through.
 */
function buildRows(events: ChatEvent[]): Row[] {
  const resultById = new Map<string, ToolResult>()
  for (const event of events) {
    if (event.kind === 'tool-result') resultById.set(event.id, { ok: event.ok, text: event.text })
  }

  const rows: Row[] = []
  let run: { key: string; tool: ToolItem }[] = []

  // Flush the buffered run of tool calls: a group when long enough, else inline rows.
  const flush = () => {
    if (run.length >= GROUP_MIN) {
      rows.push({ key: `g${run[0].key}`, kind: 'tool-group', tools: run.map((r) => r.tool) })
    } else {
      for (const r of run) rows.push({ key: r.key, kind: 'tool', tool: r.tool })
    }
    run = []
  }

  events.forEach((event) => {
    const key = rowKey(event)
    if (event.kind === 'tool-result') return // folded into its tool card
    if (event.kind === 'tool') {
      run.push({
        key,
        tool: {
          name: event.name,
          path: event.path,
          body: event.body,
          result: resultById.get(event.id),
        },
      })
      return
    }
    flush()
    rows.push({ key, kind: event.kind, text: event.text })
  })
  flush()
  return rows
}

/**
 * Attach button: opens the file picker directly from the click (a plain button, not a dropdown), so
 * WKWebView keeps the user gesture it needs to show the native picker. Reads files in-webview via the
 * `<input type="file">` + FileReader the PromptInput manages — no fs plugin or OS permission needed.
 */
function AddFilesButton() {
  const attachments = usePromptInputAttachments()
  return (
    <PromptInputButton onClick={() => attachments.openFileDialog()} title="Attach files">
      <Paperclip />
    </PromptInputButton>
  )
}

function Composer({
  disabled,
  working,
  placeholder,
  onSend,
  onStop,
  permissionMode,
  onPermissionMode,
}: {
  disabled: boolean
  working: boolean
  placeholder: string
  onSend: (text: string, files?: ChatFile[]) => void
  onStop?: () => void
  permissionMode: PermissionMode
  onPermissionMode?: (mode: PermissionMode) => void
}) {
  // Whether the textarea currently holds text. It decides what the button does while the agent is
  // working: with text it sends a follow-up (steers the turn); empty it stops. Tracked locally
  // because the standalone PromptInput keeps the textarea uncontrolled (no controller context).
  const [hasText, setHasText] = useState(false)

  // The real PromptInput self-manages the textarea + attachments (native form) and resets after
  // submit. We read out the text and turn each file's data URL into base64 `data` for the agent.
  const submit = (message: PromptInputMessage) => {
    const text = message.text.trim()
    const files: ChatFile[] = (message.files ?? [])
      .map((file) => {
        const url = file.url ?? ''
        const comma = url.indexOf(',')
        return {
          mediaType: file.mediaType ?? 'application/octet-stream',
          data: comma >= 0 ? url.slice(comma + 1) : '',
          filename: file.filename,
        }
      })
      .filter((file) => file.data)
    setHasText(false)
    if ((!text && files.length === 0) || disabled) return
    // Sending while the agent is working steers the current turn (the daemon queues the message on
    // the agent's stdin) — it does not interrupt. An empty submit while working can't reach here.
    onSend(text, files)
  }

  // While the agent is working, an empty composer's button interrupts the turn; with text typed it
  // stays a send button so the message steers the turn instead. Idle, it's always a plain submit.
  const stopMode = working && !hasText
  const onSubmitButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (stopMode) {
      event.preventDefault()
      onStop?.()
    }
  }

  return (
    <PromptInput onSubmit={submit} accept="image/*,application/pdf,text/*" multiple>
      <PromptInputBody>
        <PromptInputAttachments>
          {(attachment) => <PromptInputAttachment data={attachment} />}
        </PromptInputAttachments>
        <PromptInputTextarea
          placeholder={
            disabled ? 'Take control to reply' : working ? 'Send a follow-up…' : placeholder
          }
          disabled={disabled}
          onChange={(event) => setHasText(event.currentTarget.value.trim().length > 0)}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <AddFilesButton />
          {onPermissionMode && (
            <PermissionSelect mode={permissionMode} onChange={onPermissionMode} />
          )}
        </PromptInputTools>
        <PromptInputSubmit
          status={stopMode ? 'streaming' : 'ready'}
          onClick={onSubmitButtonClick}
          disabled={disabled}
        />
      </PromptInputFooter>
    </PromptInput>
  )
}
