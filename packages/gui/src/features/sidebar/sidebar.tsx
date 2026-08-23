import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import {
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Utils
import { openExternal, quit } from '@/lib/host'
import { isMac, modLabel } from '@/lib/platform'
import { statusTone } from '@/features/workspaces/status'

//Constants
import { APP_VERSION, REPO_URL } from '@/config'

//Icons
import CaretSvg from '@/assets/icons/caret.svg?react'
import CheckSvg from '@/assets/icons/check.svg?react'
import MugSvg from '@/assets/icons/mug.svg?react'
import PlusSvg from '@/assets/icons/plus.svg?react'
import SettingsSvg from '@/assets/icons/settings.svg?react'

//Types
import type { SessionMode, SessionSummary, Status, SubAgent } from '@soromi/protocol'
import type { WorkspaceInfo } from '@soromi/client'
import type { KeepAwakeMode } from '@soromi/protocol'

const KEEP_AWAKE_MODES: { mode: KeepAwakeMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'working', label: 'While agent works' },
  { mode: 'always', label: 'Always on' },
]

/** Per-status dot color + label for an agent (session) row. The dot alone carries the status now
 * (no text), so each state that matters has its own color: amber = running, blue = waiting on YOU,
 * red = blocked, green = review, gray = idle. Working/waiting pulse to draw the eye. */
const AGENT_STATE: Record<Status, { dot: string; pulse: boolean; label: string }> = {
  thinking: { dot: 'var(--soromi-warn)', pulse: true, label: 'Running' },
  'waiting-input': { dot: '#6b93d6', pulse: true, label: 'Waiting' },
  blocked: { dot: '#f47070', pulse: false, label: 'Blocked' },
  done: { dot: 'var(--soromi-accent)', pulse: false, label: 'Review' },
  idle: { dot: 'var(--soromi-text-faint)', pulse: false, label: 'Idle' },
}

/** The Soromi brand mark: three emerald rounded bars, drawn bare (no chip) per the design. */
function SoromiMark({ width = 15, height = 14 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 22 20" fill="#3ecf8e" aria-hidden="true">
      <rect x="0" y="1" width="22" height="4.4" rx="2.2" />
      <rect x="0" y="7.8" width="14" height="4.4" rx="2.2" />
      <rect x="0" y="14.6" width="18" height="4.4" rx="2.2" />
    </svg>
  )
}

/** Tracks whether the workspace-jump modifier (⌘ on macOS, Ctrl elsewhere) is currently held, so
 * the per-group ⌘N shortcut chips only appear while it is. */
function useModifierHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const on = (e: KeyboardEvent) => setHeld(isMac ? e.metaKey : e.ctrlKey)
    const off = () => setHeld(false)
    window.addEventListener('keydown', on)
    window.addEventListener('keyup', on)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('keydown', on)
      window.removeEventListener('keyup', on)
      window.removeEventListener('blur', off)
    }
  }, [])
  return held
}

/**
 * A session's tab label — its custom title, or the account de-duplicated by an index suffix. Mirrors
 * the terminal tab strip so a sub-tab reads the same name as its tab ("bookr", "Mobile-update", …).
 */
function sessionLabel(session: SessionSummary, sessions: SessionSummary[]): string {
  if (session.title) return session.title
  const peers = sessions.filter((s) => !s.title && s.account === session.account)
  const index = peers.findIndex((s) => s.id === session.id)
  return index <= 0 ? session.account : `${session.account} ${index}`
}

/**
 * The left sidebar: a top bar (app menu + keep-awake + settings), a "Jump to workspace" filter, and
 * the workspaces list. Each workspace is a collapsible group whose rows are its sessions (name +
 * what it's working on + state + sub-agents), with a "New session" row. Files/Skills live in the
 * separate right-hand Explorer panel. The width (right edge) is draggable and persisted.
 */
export function Sidebar() {
  const {
    active,
    sidebarWidth,
    setSidebarWidth,
    select,
    selectSession,
    activeSession,
    openCreateSpace,
  } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      sidebarWidth: s.sidebarWidth,
      setSidebarWidth: s.setSidebarWidth,
      select: s.select,
      selectSession: s.selectSession,
      activeSession: s.activeSession,
      openCreateSpace: s.openCreateSpace,
    })),
  )
  const workspaces = useClientStore((s) => s.workspaces)
  const transport = useTransport()
  const asideRef = useRef<HTMLElement>(null)
  const modHeld = useModifierHeld()

  // Which workspaces are expanded to show their sessions; the active one starts open.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(active ? [active] : []))
  // Stable (identity never changes) so a memoized WorkspaceGroup isn't re-rendered just because this
  // handler was re-created — it takes the workspace name as an argument instead of closing over it.
  const toggleExpanded = useCallback(
    (name: string) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        next.has(name) ? next.delete(name) : next.add(name)
        return next
      }),
    [],
  )

  // "Jump to workspace" filter: matches a workspace by its name or any of its session labels. The
  // field is collapsed by default and revealed by the search toggle in the Workspaces header.
  const [wsQuery, setWsQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Load account profiles so a "New session" can bind to the right one.
  useEffect(() => {
    transport.send({ type: 'list-accounts' })
  }, [transport])

  // Opens a fresh session in a workspace, as the real terminal or a headless chat (default terminal).
  // Stable: reads the current workspaces/accounts imperatively from the store (they change on every
  // status tick), so its identity never changes and doesn't defeat WorkspaceGroup's memoization.
  const openNewSession = useCallback(
    (name: string, mode: SessionMode = 'terminal') => {
      const { workspaces, accounts } = useClientStore.getState()
      const ws = workspaces.find((w) => w.name === name)
      const agent = ws?.accounts[0]?.agent ?? 'claude'
      const bound = ws?.accounts.some((a) => a.agent === agent) ?? false
      const account = bound
        ? undefined
        : (accounts.find((a) => agent in a.providers)?.name ?? 'personal')
      transport.send({ type: 'open-session', workspace: name, agent, account, mode })
      select(name)
      setExpanded((prev) => new Set(prev).add(name))
    },
    [transport, select],
  )

  // Drag-to-reorder with pointer events (native HTML5 DnD is unreliable in the desktop WKWebView:
  // it refuses to start without setData and shows a "+ can't drop" cursor). `order` is the optimistic
  // order held until the daemon's list matches it; `drag` is the card being moved and the index the
  // green line marks (0..n, where n means "after the last card").
  const [order, setOrder] = useState<string[] | null>(null)
  const [drag, setDrag] = useState<{ name: string; insertAt: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const ordered = useMemo(() => {
    if (!order) return workspaces
    const byName = new Map(workspaces.map((w) => [w.name, w]))
    const out: WorkspaceInfo[] = []
    for (const name of order) {
      const w = byName.get(name)
      if (w) out.push(w)
    }
    for (const w of workspaces) if (!order.includes(w.name)) out.push(w)
    return out
  }, [workspaces, order])

  useEffect(() => {
    if (
      order &&
      workspaces.length === order.length &&
      workspaces.every((w, i) => w.name === order[i])
    ) {
      setOrder(null)
    }
  }, [workspaces, order])

  // Which slot the pointer's Y is over: the first card whose vertical midpoint sits below it, else
  // the end. Measured live off the DOM so expanded (taller) cards are handled correctly.
  const insertIndexForY = (y: number): number => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-ws]')
    if (!rows) return 0
    let i = 0
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (y < rect.top + rect.height / 2) return i
      i += 1
    }
    return i
  }

  const commitReorder = (from: string, insertAt: number) => {
    const base = order ?? ordered.map((w) => w.name)
    const names = base.slice()
    const fi = names.indexOf(from)
    if (fi < 0) return
    // Removing the dragged card first shifts every later slot up by one.
    const ti = fi < insertAt ? insertAt - 1 : insertAt
    names.splice(fi, 1)
    names.splice(ti, 0, from)
    if (names.every((n, i) => n === base[i])) return
    setOrder(names)
    transport.send({ type: 'reorder-spaces', order: names })
  }

  // Begin a pointer-drag from a card body. A real move (past a small threshold) turns into a reorder;
  // a press without movement falls through to the card's normal click (select).
  const startReorder = (name: string, event: React.PointerEvent) => {
    if (event.button !== 0) return
    // Let the kebab / expand buttons handle their own presses; only the card body starts a drag.
    if ((event.target as HTMLElement).closest('button')) return
    const startY = event.clientY
    // Suppress text selection for the whole gesture up front — waiting until the move threshold lets
    // the browser start a selection on the initial press (highlighting the workspace names).
    document.body.style.userSelect = 'none'
    let moving = false
    const onMove = (move: PointerEvent) => {
      if (!moving && Math.abs(move.clientY - startY) < 4) return
      if (!moving) {
        moving = true
        document.body.style.cursor = 'grabbing'
      }
      setDrag({ name, insertAt: insertIndexForY(move.clientY) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDrag((d) => {
        if (d) commitReorder(d.name, d.insertAt)
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Drag the right edge to resize the sidebar width.
  const startResizeWidth = (event: React.PointerEvent) => {
    event.preventDefault()
    const left = asideRef.current?.getBoundingClientRect().left ?? 0
    const onMove = (move: PointerEvent) => setSidebarWidth(move.clientX - left)
    endDrag(onMove, 'col-resize')
  }

  // "Jump to workspace" narrows the list by workspace name or any of its session labels. Memoized so
  // the O(sessions²) label scan reruns only when the list or query changes, not on every render.
  const query = wsQuery.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      query
        ? ordered.filter(
            (w) =>
              w.name.toLowerCase().includes(query) ||
              w.sessions.some((s) => sessionLabel(s, w.sessions).toLowerCase().includes(query)),
          )
        : ordered,
    [ordered, query],
  )
  // Name -> position, so each row's index is an O(1) lookup instead of an O(n) indexOf (O(n²) total).
  const orderIndex = useMemo(() => new Map(ordered.map((w, i) => [w.name, i])), [ordered])

  // Stable per-row handlers so the memoized WorkspaceGroup / SessionRow skip re-rendering during the
  // frequent status ticks. Each takes the workspace name / session id as an argument rather than
  // closing over it, and reads volatile values (the filter query, the reorder closure) through refs.
  const queryRef = useRef(query)
  queryRef.current = query
  const startReorderRef = useRef(startReorder)
  startReorderRef.current = startReorder
  const handleDragStart = useCallback((name: string, event: React.PointerEvent) => {
    if (!queryRef.current) startReorderRef.current(name, event)
  }, [])
  const handleSelectSession = useCallback(
    (name: string, id: string) => {
      select(name)
      selectSession(name, id)
    },
    [select, selectSession],
  )
  const handleRenameSession = useCallback(
    (id: string, title: string) => transport.send({ type: 'rename-session', session: id, title }),
    [transport],
  )
  const handleCloseSession = useCallback(
    (id: string) => transport.send({ type: 'close-session', session: id }),
    [transport],
  )

  return (
    <aside
      ref={asideRef}
      className="relative flex flex-shrink-0 flex-col overflow-hidden bg-[var(--soromi-bg-shell)] text-[13px] text-[var(--soromi-text-dim)]"
      style={{ width: sidebarWidth }}
    >
      <TopBar />

      <div className="flex items-center justify-between px-3.5 pt-[15px] pb-2">
        <div className="flex items-center gap-[7px]">
          <span className="text-[10.5px] text-[var(--soromi-text-faint)] uppercase tracking-[0.09em]">
            Workspaces
          </span>
          <span className="rounded-full bg-[#1f1f1f] px-1.5 py-px text-[10px] font-semibold text-[#6e6e6e]">
            {workspaces.length}
          </span>
        </div>
        <div className="flex items-center gap-[2px]">
          <button
            type="button"
            title="Search workspaces"
            onClick={() => setSearchOpen((open) => !open)}
            className={cn(
              'flex h-[26px] w-[26px] cursor-pointer appearance-none items-center justify-center rounded-[7px] border-none bg-transparent hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]',
              searchOpen ? 'text-[var(--soromi-text-dim)]' : 'text-[var(--soromi-text-faint)]',
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </button>
          <button
            type="button"
            title="New workspace"
            onClick={openCreateSpace}
            className="flex h-[26px] w-[26px] cursor-pointer appearance-none items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-accent)]"
          >
            <PlusSvg width={15} height={15} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="flex-none px-3 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--soromi-border-subtle)] bg-[var(--soromi-bg-app)] px-[9px]">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#565656"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-none"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={wsQuery}
              onChange={(e) => setWsQuery(e.currentTarget.value)}
              placeholder="Jump to workspace"
              className="min-w-0 flex-1 border-none bg-transparent py-[7px] font-[inherit] text-[12.5px] text-[var(--soromi-text)] outline-none placeholder:text-[#565656]"
            />
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto overflow-x-hidden px-2 pb-3"
      >
        {filtered.map((workspace) => {
          const index = orderIndex.get(workspace.name) ?? 0
          return (
            <WorkspaceGroup
              key={workspace.name}
              workspace={workspace}
              index={index}
              active={workspace.name === active}
              open={expanded.has(workspace.name)}
              activeSession={activeSession[workspace.name]}
              shortcutHeld={modHeld}
              dragging={drag?.name === workspace.name}
              // Green insertion line: above this group when it's the drop slot, or below the last
              // group when dropping at the very end.
              dropBefore={drag != null && drag.insertAt === index}
              dropAfter={
                drag != null && drag.insertAt === ordered.length && index === ordered.length - 1
              }
              onDragStart={handleDragStart}
              onToggle={toggleExpanded}
              onNewSession={openNewSession}
              onSelectSession={handleSelectSession}
              onRenameSession={handleRenameSession}
              onCloseSession={handleCloseSession}
            />
          )
        })}
      </div>

      {/* Drag handle on the right edge: the sidebar's border shows the divider; this turns it accent
          full-height on hover/drag. */}
      <div
        className="absolute inset-y-0 right-[-3px] z-[var(--z-sidebar-resize)] w-[7px] cursor-col-resize after:absolute after:inset-y-0 after:right-[3px] after:w-px after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-[var(--soromi-accent)] active:after:bg-[var(--soromi-accent)]"
        onPointerDown={startResizeWidth}
        title="Drag to resize"
      />
    </aside>
  )
}

/** Wires a pointer-move handler to window until pointerup, with a body cursor while dragging. */
function endDrag(onMove: (event: PointerEvent) => void, cursor: string) {
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  document.body.style.cursor = cursor
  document.body.style.userSelect = 'none'
}

/** The top bar: app menu (logo), keep-awake, and settings. Replaces the removed rail. */
function TopBar() {
  const transport = useTransport()
  const { openSettings, setNotice } = useAppStore(
    useShallow((s) => ({ openSettings: s.openSettings, setNotice: s.setNotice })),
  )
  const { keepAwake, keepAwakeMode, setKeepAwakeMode } = useClientStore(
    useShallow((s) => ({
      keepAwake: s.keepAwake,
      keepAwakeMode: s.keepAwakeMode,
      setKeepAwakeMode: s.setKeepAwakeMode,
    })),
  )
  const [aboutOpen, setAboutOpen] = useState(false)

  const checkUpdates = () => {
    setNotice('Checking for updates…')
    transport.send({ type: 'check-update' })
  }
  const selectKeepAwake = (mode: KeepAwakeMode) => {
    setKeepAwakeMode(mode)
    transport.send({ type: 'set-keep-awake-mode', mode })
  }

  const iconBtn =
    'flex h-[30px] w-[30px] cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]'

  return (
    // Drag region so the window moves by dragging the top bar; on macOS the left inset clears the
    // overlaid traffic-light buttons (hiddenInset title bar — see the Electron shell's window.ts).
    <div
      data-drag-region
      className={cn(
        'box-border flex h-[41px] flex-none select-none items-center gap-[9px] pr-3',
        isMac ? 'pl-[76px]' : 'pl-3',
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Soromi"
            className="flex cursor-pointer appearance-none items-center gap-[9px] rounded-[10px] border-none bg-transparent py-[5px] pr-2 pl-[5px] outline-none hover:bg-[var(--soromi-bg-hover)] focus-visible:outline-none"
          >
            <span className="-mr-[3px] flex h-[30px] w-[22px] flex-none items-center justify-center">
              <SoromiMark width={15} height={14} />
            </span>
            <span className="font-medium text-[14px] text-[var(--soromi-text)]">Soromi</span>
            <CaretSvg width={14} height={14} className="text-[var(--soromi-text-faint)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[230px]">
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-1.5">
            <span className="flex h-[30px] w-[22px] items-center justify-center">
              <SoromiMark width={16} height={15} />
            </span>
            <div>
              <div className="font-semibold text-[13px] text-[var(--soromi-text)]">Soromi</div>
              <div className="text-[11px] text-[var(--soromi-text-faint)]">
                Version {APP_VERSION}
              </div>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAboutOpen(true)}>About Soromi</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openExternal(REPO_URL)}>
            Help &amp; docs
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openSettings}>
            Settings
            <span className="ml-auto text-[var(--soromi-text-faint)] text-xs">⌘,</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={checkUpdates}>Check for updates…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={quit}>
            Quit Soromi
            <span className="ml-auto text-[var(--soromi-text-faint)] text-xs">⌘Q</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent hideClose className="max-w-[340px]">
          <div className="flex flex-col items-center gap-2 px-1 pt-2 pb-1 text-center">
            <span className="mb-2 flex h-[52px] w-[52px] items-center justify-center">
              <SoromiMark width={40} height={36} />
            </span>
            <div className="font-bold text-[var(--soromi-text)] text-lg">Soromi</div>
            <div className="mb-2 text-[13px] text-[var(--soromi-text-faint)]">
              Version {APP_VERSION}
            </div>
            <p className="text-center text-muted-foreground text-sm">
              A small, fast home for AI coding agents. The daemon owns the terminals; this window is
              just a viewport.
            </p>
            <button
              type="button"
              className="appearance-none border-0 bg-transparent text-primary text-sm hover:underline"
              onClick={() => openExternal(REPO_URL)}
            >
              github.com/soromi/soromi
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div data-drag-region className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Keep awake: ${KEEP_AWAKE_MODES.find((m) => m.mode === keepAwakeMode)?.label}`}
            className={cn(iconBtn, keepAwake && 'text-[var(--soromi-accent)]')}
          >
            <MugSvg width={17} height={17} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuLabel>Keep awake</DropdownMenuLabel>
          {KEEP_AWAKE_MODES.map(({ mode, label }) => (
            <DropdownMenuItem key={mode} onClick={() => selectKeepAwake(mode)}>
              <CheckSvg
                width={14}
                height={14}
                className={cn('opacity-0', mode === keepAwakeMode && 'opacity-100')}
              />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button type="button" title="Settings" className={iconBtn} onClick={openSettings}>
        <SettingsSvg width={17} height={17} />
      </button>
    </div>
  )
}

/** A status dot; amber/running states pulse (motion-safe). Color comes from the caller. `title`
 * surfaces the status name on hover, since the row no longer shows it as text. */
function Dot({
  color,
  pulse,
  size = 6,
  title,
}: {
  color: string
  pulse: boolean
  size?: number
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn('flex-none rounded-full', pulse && 'motion-safe:animate-status-pulse')}
      style={{ width: size, height: size, background: color }}
    />
  )
}

/** One workspace group: a collapsible header (chevron, uppercase name, a rule, aggregate status
 * pills, jump shortcut, menu) over its session rows. Sessions are the navigation surface; the
 * terminal has no tab strip, and fresh ones start from the "New session" row here. */
// Memoized: only re-renders when its own props change. Since `setSessionStatus` preserves the object
// reference of every *unaffected* workspace and all the handlers below are stable, a status tick in
// one workspace re-renders only that group — not the whole list.
const WorkspaceGroup = memo(function WorkspaceGroup({
  workspace,
  index,
  active,
  open,
  activeSession,
  shortcutHeld,
  dragging,
  dropBefore,
  dropAfter,
  onDragStart,
  onToggle,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onCloseSession,
}: {
  workspace: WorkspaceInfo
  index: number
  active: boolean
  open: boolean
  activeSession?: string
  shortcutHeld: boolean
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  onDragStart: (name: string, event: React.PointerEvent) => void
  onToggle: (name: string) => void
  onNewSession: (name: string, mode: SessionMode) => void
  onSelectSession: (name: string, id: string) => void
  onRenameSession: (id: string, title: string) => void
  onCloseSession: (id: string) => void
}) {
  const openWorkspaceSettings = useAppStore((s) => s.openWorkspaceSettings)
  const sessions = workspace.sessions
  // Aggregate header pills: amber = sessions still working / waiting, green = done (needs review).
  const runCount = sessions.filter((s) => {
    const tone = statusTone(s.status)
    return tone === 'running' || tone === 'attention'
  }).length
  const reviewCount = sessions.filter((s) => s.status === 'done').length
  const kbd = index < 9 ? `${modLabel}${index + 1}` : null

  return (
    <div
      data-ws={workspace.name}
      className={cn(
        'group relative rounded-[8px]',
        // Green insertion line marking where a dragged group will land: above this one, or below it
        // when it's the last one and the drop is at the very end.
        dropBefore && 'shadow-[inset_0_2px_0_0_var(--soromi-accent)]',
        dropAfter && 'shadow-[inset_0_-2px_0_0_var(--soromi-accent)]',
      )}
      style={{ opacity: dragging ? 0.4 : 1 }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-toggle, press-and-drag to reorder. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the menu is a focusable button; ⌘N jumps here. */}
      <div
        className="flex cursor-pointer select-none items-center gap-2 rounded-[8px] py-[7px] pr-1.5 pl-2 hover:bg-[#1f1f1f]"
        onClick={() => onToggle(workspace.name)}
        onPointerDown={(e) => onDragStart(workspace.name, e)}
      >
        <span className="flex h-3 w-3 flex-none items-center justify-center text-[#565656]">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
        <span
          className={cn(
            'flex-none overflow-hidden text-ellipsis whitespace-nowrap font-normal text-[12.5px] tracking-[0.02em]',
            active ? 'text-[var(--soromi-text)]' : 'text-[var(--soromi-text-dim)]',
          )}
        >
          {workspace.name}
        </span>
        <span className="min-w-2 flex-1" />
        {runCount > 0 && (
          <span
            title={`${runCount} running`}
            className="inline-flex flex-none items-center gap-1 rounded-full bg-[rgba(224,179,65,0.13)] px-[7px] py-0.5 font-semibold text-[#c99a2e] text-[10.5px]"
          >
            <span className="h-[5px] w-[5px] rounded-full bg-[#e0b341] motion-safe:animate-status-pulse" />
            {runCount}
          </span>
        )}
        {reviewCount > 0 && (
          <span
            title={`${reviewCount} to review`}
            className="inline-flex flex-none items-center gap-1 rounded-full bg-[rgba(62,207,142,0.13)] px-[7px] py-0.5 font-semibold text-[#3ecf8e] text-[10.5px]"
          >
            <span className="h-[5px] w-[5px] rounded-full bg-[#3ecf8e]" />
            {reviewCount}
          </span>
        )}
        {runCount === 0 && reviewCount === 0 && (
          <span className="flex-none text-[#565656] text-[10.5px]">Idle</span>
        )}
        {kbd && shortcutHeld && (
          <span className="flex-none text-[#565656] text-[9.5px] [font-family:var(--soromi-font-mono)]">
            {kbd}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="More"
              onClick={(e) => e.stopPropagation()}
              className="flex h-5 w-5 flex-none cursor-pointer appearance-none items-center justify-center rounded-[5px] border-none bg-transparent text-[#565656] hover:bg-[#2a2a2a] hover:text-[var(--soromi-text)] data-[state=open]:bg-[#2a2a2a] data-[state=open]:text-[var(--soromi-text)]"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="5.5" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="18.5" r="1.6" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          {/* Radix portals this content, but React events still bubble through the React tree to the
              header's onClick — stop menu clicks from toggling the group behind it. */}
          <DropdownMenuContent
            align="end"
            className="w-[186px]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() => openWorkspaceSettings(workspace.name)}
            >
              <SettingsSvg width={15} height={15} />
              Workspace settings…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && (
        <div className="ml-[10px] flex flex-col gap-0.5 pt-1 pb-1.5 pl-1">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              label={sessionLabel(session, sessions)}
              // Only the active workspace's current session is highlighted, so a non-active group's
              // open list doesn't look like it's the one in focus.
              activeSession={active && session.id === activeSession}
              workspaceName={workspace.name}
              onSelectSession={onSelectSession}
              onRenameSession={onRenameSession}
              onCloseSession={onCloseSession}
            />
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex cursor-pointer appearance-none items-center gap-[9px] rounded-[8px] border-none bg-transparent px-[9px] py-1.5 text-left text-[#6e6e6e] text-[12px] hover:bg-[#1f1f1f] hover:text-[var(--soromi-accent)] data-[state=open]:text-[var(--soromi-accent)]"
              >
                <span className="flex w-1.5 flex-none items-center justify-center">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                New session
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[170px]">
              <DropdownMenuItem onSelect={() => onNewSession(workspace.name, 'terminal')}>
                Terminal
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onNewSession(workspace.name, 'chat')}>
                Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
})

/**
 * One session row inside an open workspace group: its status dot, name (double-click to rename), an
 * always-present subtitle (what it's working on, or "New session"), and its live state. Sub-agents
 * nest behind a count pill; a hover ✕ closes the session (managed here, no terminal tab strip).
 *
 * Memoized: within a group whose status changed, only the session whose object actually changed
 * re-renders (`setSessionStatus` preserves the reference of the others), so the handlers are stable
 * and parameterized by name/id rather than closed over per row.
 */
const SessionRow = memo(function SessionRow({
  session,
  label,
  activeSession,
  workspaceName,
  onSelectSession,
  onRenameSession,
  onCloseSession,
}: {
  session: SessionSummary
  label: string
  activeSession: boolean
  workspaceName: string
  onSelectSession: (name: string, id: string) => void
  onRenameSession: (id: string, title: string) => void
  onCloseSession: (id: string) => void
}) {
  const state = AGENT_STATE[session.status]
  // The subtitle is always shown so the two-line rhythm holds across the list: what the provider is
  // working on, or "New session" for one that hasn't done anything yet.
  const subtitle = session.activity || 'New session'
  // Sub-agents nest under the tab only for terminal sessions; chat sessions surface them in the
  // panel above the composer instead (so they aren't shown twice).
  const subagents = session.mode === 'chat' ? [] : (session.subagents ?? [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    setDraft(session.title ?? '')
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    onRenameSession(session.id, draft.trim())
  }

  return (
    <div>
      <div
        className={cn(
          'group/row flex items-center gap-[9px] rounded-[8px] px-[9px] py-[7px] hover:bg-[#1f1f1f]',
          activeSession && 'bg-[#1f1f1f]',
        )}
      >
        {editing ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: focus the field the user just opened to rename.
            autoFocus
            className="w-full rounded border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-1.5 py-1 font-[inherit] text-[12px] text-[var(--soromi-text)] focus:border-[var(--soromi-accent)] focus:outline-none"
            value={draft}
            placeholder={session.account}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                setEditing(false)
              }
            }}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSelectSession(workspaceName, session.id)}
              onDoubleClick={startEdit}
              title="Double-click to rename"
              className="flex min-w-0 flex-1 cursor-pointer appearance-none items-center gap-[9px] border-none bg-transparent p-0 text-left"
            >
              <Dot color={state.dot} pulse={state.pulse} size={6} title={state.label} />
              <div className="min-w-0 flex-1 leading-[1.35]">
                <div
                  className={cn(
                    'overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[12.5px]',
                    activeSession ? 'text-[var(--soromi-text)]' : 'text-[#d6d6d6]',
                  )}
                >
                  {label}
                </div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[#6e6e6e] text-[11px]">
                  {subtitle}
                </div>
              </div>
            </button>
            {subagents.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                title={open ? 'Hide sub-agents' : 'Show sub-agents'}
                className="inline-flex flex-none cursor-pointer appearance-none items-center gap-[3px] rounded-full border-none bg-[#1f1f1f] px-1.5 py-0.5 font-semibold text-[#8a8a8a] text-[10px] hover:bg-[#2c2c31] hover:text-[var(--soromi-text)]"
              >
                {subagents.length}
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn('transition-transform', open && 'rotate-180')}
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => onCloseSession(session.id)}
              title="Close session"
              className="flex h-[19px] w-[19px] flex-none cursor-pointer appearance-none items-center justify-center rounded-[5px] border-none bg-transparent text-[#565656] hover:bg-[#363636] hover:text-[var(--soromi-text)]"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </>
        )}
      </div>

      {open && <SubAgentList sessionId={session.id} subagents={subagents} />}
    </div>
  )
})

/** The sub-agents a session spawned (Claude Agent/Task calls), nested behind a connector rule; the
 * dot is each one's live status. */
function SubAgentList({ sessionId, subagents }: { sessionId: string; subagents: SubAgent[] }) {
  return (
    <div className="mt-px mb-1 ml-[15px] flex flex-col gap-px border-[#2a2a2a] border-l pl-[11px]">
      {subagents.map((sub, index) => {
        const st = AGENT_STATE[sub.status]
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: positional; same-named sub-agents can repeat.
            key={`${sessionId}:${sub.name}:${index}`}
            className="flex items-center gap-2 rounded-[6px] px-[7px] py-1 hover:bg-[#1f1f1f]"
          >
            <Dot color={st.dot} pulse={st.pulse} size={5} />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#8a8a8a] text-[11px]">
              {sub.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
