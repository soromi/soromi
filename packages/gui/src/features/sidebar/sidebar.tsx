import { useEffect, useMemo, useRef, useState } from 'react'
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
import { WS_COLOR_PALETTE, useAppStore } from '@/stores/app-store'

//Utils
import { openExternal, quit } from '@/lib/host'
import { isMac, modLabel } from '@/lib/platform'
import { statusTone } from '@/features/workspaces/status'

//Constants
import { APP_VERSION, REPO_URL } from '@/config'

//Icons
import CaretSvg from '@/assets/icons/caret.svg?react'
import CheckSvg from '@/assets/icons/check.svg?react'
import IsoLogo from '@/assets/icons/iso-dark.svg?react'
import MugSvg from '@/assets/icons/mug.svg?react'
import PlusSvg from '@/assets/icons/plus.svg?react'
import SettingsSvg from '@/assets/icons/settings.svg?react'

//Types
import type { SessionSummary, Status, SubAgent } from '@soromi/protocol'
import type { WorkspaceInfo } from '@soromi/client'
import type { KeepAwakeMode } from '@soromi/protocol'

const KEEP_AWAKE_MODES: { mode: KeepAwakeMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'working', label: 'While agent works' },
  { mode: 'always', label: 'Always on' },
]

/** Per-status dot color + label for an agent (session) row. Amber states pulse to draw the eye. */
const AGENT_STATE: Record<Status, { dot: string; pulse: boolean; label: string }> = {
  thinking: { dot: 'var(--soromi-warn)', pulse: true, label: 'Running' },
  'waiting-input': { dot: 'var(--soromi-warn)', pulse: true, label: 'Waiting' },
  blocked: { dot: '#f47070', pulse: false, label: 'Blocked' },
  done: { dot: 'var(--soromi-accent)', pulse: false, label: 'Review' },
  idle: { dot: 'var(--soromi-text-faint)', pulse: false, label: 'Idle' },
}

/** The default avatar-square color for a workspace: a stable palette color hashed from its name. */
const PICKABLE = WS_COLOR_PALETTE.filter((c) => c !== 'none')
const defaultColor = (name: string): string => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PICKABLE[hash % PICKABLE.length]
}

/** Tracks whether the workspace-jump modifier (⌘ on macOS, Ctrl elsewhere) is currently held. */
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
 * A workspace's one-line agent overview. There is always a line: review / waiting / running when
 * something's happening, otherwise a plain gray "Idle".
 */
function summarize(sessions: SessionSummary[]): { label: string; dot: string; pulse: boolean } {
  const done = sessions.filter((s) => s.status === 'done').length
  const attention = sessions.filter((s) => statusTone(s.status) === 'attention').length
  const running = sessions.filter((s) => statusTone(s.status) === 'running').length

  if (done > 0) {
    return {
      label: `${done} need${done === 1 ? 's' : ''} review`,
      dot: 'var(--soromi-accent)',
      pulse: false,
    }
  }
  if (attention > 0) {
    return { label: `${attention} waiting for you`, dot: 'var(--soromi-warn)', pulse: true }
  }
  if (running > 0) {
    return {
      label: `${running} agent${running === 1 ? '' : 's'} running`,
      dot: 'var(--soromi-warn)',
      pulse: true,
    }
  }
  return { label: 'Idle', dot: 'var(--soromi-text-faint)', pulse: false }
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
 * The left sidebar: a top bar (app menu + keep-awake + settings) and the workspaces list, which
 * fills the rest. Each card can expand to its tabs and their sub-agents. Files/Skills live in the
 * separate right-hand Explorer panel now. The width (right edge) is draggable and persisted.
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
    wsColors,
    setWorkspaceColor,
  } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      sidebarWidth: s.sidebarWidth,
      setSidebarWidth: s.setSidebarWidth,
      select: s.select,
      selectSession: s.selectSession,
      activeSession: s.activeSession,
      openCreateSpace: s.openCreateSpace,
      wsColors: s.wsColors,
      setWorkspaceColor: s.setWorkspaceColor,
    })),
  )
  const workspaces = useClientStore((s) => s.workspaces)
  const transport = useTransport()
  const asideRef = useRef<HTMLElement>(null)
  const modHeld = useModifierHeld()

  // Which workspaces are expanded to show their agents; the active one starts open.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(active ? [active] : []))
  const toggleExpanded = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  // Drag-to-reorder via native HTML5 DnD. `order` is the optimistic order held until the daemon's
  // list matches it; `drag` is the card being dragged and the one it's hovering.
  const [order, setOrder] = useState<string[] | null>(null)
  const [drag, setDrag] = useState<{ name: string; over: string | null } | null>(null)

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

  const dropOn = (target: string) => {
    const from = drag?.name
    setDrag(null)
    if (!from || from === target) return
    const names = (order ?? ordered.map((w) => w.name)).slice()
    const fi = names.indexOf(from)
    const ti = names.indexOf(target)
    if (fi < 0 || ti < 0) return
    names.splice(fi, 1)
    names.splice(ti, 0, from)
    setOrder(names)
    transport.send({ type: 'reorder-spaces', order: names })
  }

  // Drag the right edge to resize the sidebar width.
  const startResizeWidth = (event: React.PointerEvent) => {
    event.preventDefault()
    const left = asideRef.current?.getBoundingClientRect().left ?? 0
    const onMove = (move: PointerEvent) => setSidebarWidth(move.clientX - left)
    endDrag(onMove, 'col-resize')
  }

  return (
    <aside
      ref={asideRef}
      className="relative flex flex-shrink-0 flex-col overflow-hidden border-[var(--soromi-border)] border-r bg-[var(--soromi-bg-sidebar)] text-[13px] text-[var(--soromi-text-dim)]"
      style={{ width: sidebarWidth }}
    >
      <TopBar />

      <div className="flex items-center justify-between px-3.5 pt-4 pb-2.5">
        <span className="text-[10.5px] text-[var(--soromi-text-faint)] uppercase tracking-[0.09em]">
          Workspaces
        </span>
        <button
          type="button"
          title="New workspace"
          onClick={openCreateSpace}
          className="flex h-[26px] w-[26px] cursor-pointer appearance-none items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-accent)]"
        >
          <PlusSvg width={15} height={15} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[5px] overflow-y-auto px-2.5 pb-2">
        {ordered.map((workspace, index) => (
          <WorkspaceCard
            key={workspace.name}
            workspace={workspace}
            index={index}
            active={workspace.name === active}
            expanded={expanded.has(workspace.name)}
            activeSession={activeSession[workspace.name]}
            shortcutHeld={modHeld}
            color={wsColors[workspace.name] ?? defaultColor(workspace.name)}
            onCycleColor={() => {
              const current = wsColors[workspace.name] ?? defaultColor(workspace.name)
              const next =
                WS_COLOR_PALETTE[(WS_COLOR_PALETTE.indexOf(current) + 1) % WS_COLOR_PALETTE.length]
              setWorkspaceColor(workspace.name, next)
            }}
            onPickColor={(c) => setWorkspaceColor(workspace.name, c)}
            dragging={drag?.name === workspace.name}
            dropOver={drag?.over === workspace.name && drag?.name !== workspace.name}
            onDragStart={() => setDrag({ name: workspace.name, over: null })}
            onDragOver={() =>
              setDrag((d) => (d && d.over !== workspace.name ? { ...d, over: workspace.name } : d))
            }
            onDrop={() => dropOn(workspace.name)}
            onDragEnd={() => setDrag(null)}
            onSelect={() => select(workspace.name)}
            onToggle={() => toggleExpanded(workspace.name)}
            onSelectSession={(id) => {
              select(workspace.name)
              selectSession(workspace.name, id)
            }}
          />
        ))}
      </div>

      {/* Drag handle on the right edge: a thin line that turns accent on hover/drag. */}
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
    <div className="box-border flex h-[41px] flex-none items-center gap-[9px] border-[var(--soromi-border)] border-b px-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Soromi"
            className="flex cursor-pointer appearance-none items-center gap-[9px] rounded-[10px] border-none bg-transparent py-[5px] pr-2 pl-[5px] hover:bg-[var(--soromi-bg-hover)]"
          >
            <span className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-[7px] bg-[#efece1]">
              <IsoLogo width={12} height={11} />
            </span>
            <span className="font-semibold text-[14px] text-[var(--soromi-text)]">Soromi</span>
            <CaretSvg width={14} height={14} className="text-[var(--soromi-text-faint)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[230px]">
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-1.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#efece1]">
              <IsoLogo width={16} height={16} />
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
            <span className="mb-1 flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-[#efece1]">
              <IsoLogo width={34} height={34} />
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

      <div className="flex-1" />

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

/** A status dot; amber/running states pulse (motion-safe). Color comes from the caller. */
function Dot({ color, pulse, size = 6 }: { color: string; pulse: boolean; size?: number }) {
  return (
    <span
      className={cn('flex-none rounded-full', pulse && 'motion-safe:animate-status-pulse')}
      style={{ width: size, height: size, background: color }}
    />
  )
}

/** One workspace card: the row (avatar, name, agent overview, menu) and its expanded agent list. */
function WorkspaceCard({
  workspace,
  index,
  active,
  expanded,
  activeSession,
  shortcutHeld,
  color,
  onCycleColor,
  onPickColor,
  dragging,
  dropOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSelect,
  onToggle,
  onSelectSession,
}: {
  workspace: WorkspaceInfo
  index: number
  active: boolean
  expanded: boolean
  activeSession?: string
  shortcutHeld: boolean
  color: string
  onCycleColor: () => void
  onPickColor: (color: string) => void
  dragging: boolean
  dropOver: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
  onSelect: () => void
  onToggle: () => void
  onSelectSession: (id: string) => void
}) {
  const openWorkspaceSettings = useAppStore((s) => s.openWorkspaceSettings)
  const sessions = workspace.sessions
  const summary = useMemo(() => summarize(sessions), [sessions])
  // With a single tab the card's own status line already says everything an expanded row would, so
  // there's nothing to expand — only 2+ tabs get the chevron and the per-tab list.
  const multiTab = sessions.length > 1
  // A single-tab workspace has no expandable row, so surface its agent's current activity right on
  // the status line ("Editing config.ts") instead of the generic "1 agent running" -- but only while
  // it's actually working, so a finished turn doesn't leave a stale tool call under an idle card.
  const solo = !multiTab ? sessions[0] : undefined
  const soloLabel = (solo?.status === 'thinking' && solo.activity) || summary.label
  // The first nine workspaces get a jump shortcut (⌘1..9 / Ctrl+1..9), shown while the key is held.
  const shortcut = index < 9 ? `${modLabel}${index + 1}` : null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: native drag-to-reorder on the card.
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative rounded-[11px]',
        active ? 'bg-[#1c1c20]' : 'hover:bg-[#17171a]',
        // The green line at the top marks where a dragged card will drop.
        dropOver && 'shadow-[inset_0_2px_0_0_var(--soromi-accent)]',
      )}
      style={{ opacity: dragging ? 0.4 : 1 }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-select the workspace. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: children (color, toggle, menu) are focusable buttons. */}
      <div className="flex cursor-pointer items-center gap-2.5 px-2.5 py-2" onClick={onSelect}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: click cycles the workspace color. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the whole card + kebab keep it reachable. */}
        <span
          title="Change color"
          className="h-[14px] w-[14px] flex-none rounded-[5px] border transition-transform hover:scale-[1.18]"
          style={{
            background: color === 'none' ? 'transparent' : color,
            borderColor: color === 'none' ? 'var(--soromi-text-faint)' : 'transparent',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onCycleColor()
          }}
        />
        <div className="min-w-0 flex-1 leading-[1.35]">
          <div
            className={cn(
              'overflow-hidden text-ellipsis whitespace-nowrap text-[12px]',
              active
                ? 'font-semibold text-[var(--soromi-text)]'
                : 'font-medium text-[var(--soromi-text-dim)]',
            )}
          >
            {workspace.name}
          </div>
          {/* Status line: the agent overview (a gray "Idle" when nothing's running), plus the ⌘N
              jump shortcut which only appears while the modifier is held. */}
          <div className="mt-px flex items-center gap-[5px]">
            {multiTab ? (
              <button
                type="button"
                onClick={onToggle}
                className="flex cursor-pointer appearance-none items-center gap-[5px] rounded-[5px] border-none bg-transparent py-px pr-1 pl-0 text-[10.5px] hover:text-[var(--soromi-text)]"
                style={{ color: summary.dot }}
              >
                <Dot color={summary.dot} pulse={summary.pulse} size={5} />
                <span>{summary.label}</span>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn('opacity-75 transition-transform', expanded && 'rotate-180')}
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            ) : (
              <span
                className="flex min-w-0 items-center gap-[5px] text-[10.5px]"
                style={{ color: summary.dot }}
              >
                <Dot color={summary.dot} pulse={summary.pulse} size={5} />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{soloLabel}</span>
              </span>
            )}
            {shortcut && shortcutHeld && (
              <span
                className={cn(
                  'text-[9.5px] [font-family:var(--soromi-font-mono)]',
                  active ? 'text-[#8a8a8e]' : 'text-[#5a5a5e]',
                )}
              >
                {shortcut}
              </span>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="More"
              onClick={(e) => e.stopPropagation()}
              className="flex h-[22px] w-[22px] flex-none cursor-pointer appearance-none items-center justify-center rounded-md border-none bg-transparent text-[#5a5a5e] hover:bg-[var(--soromi-bg-active)] hover:text-[var(--soromi-text)] data-[state=open]:bg-[var(--soromi-bg-active)] data-[state=open]:text-[var(--soromi-text)]"
            >
              <svg
                width="14"
                height="14"
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
          {/* Radix portals this content, but React events still bubble through the React tree to
              the card's onClick={select}, which resets overlays[] — wiping the settings overlay the
              moment it opens. Stop menu clicks from reaching the card. */}
          <DropdownMenuContent
            align="end"
            className="w-[210px]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuLabel>Color</DropdownMenuLabel>
            <div className="flex items-center justify-between px-2 pb-1.5">
              {WS_COLOR_PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  title={c === 'none' ? 'No color' : c}
                  onClick={() => onPickColor(c)}
                  className="h-[18px] w-[18px] flex-none cursor-pointer appearance-none rounded-md border-[1.5px]"
                  style={{
                    background: c === 'none' ? 'transparent' : c,
                    borderColor:
                      c === color
                        ? 'var(--soromi-accent)'
                        : c === 'none'
                          ? 'var(--soromi-text-faint)'
                          : 'transparent',
                  }}
                />
              ))}
            </div>
            <DropdownMenuSeparator />
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

      {/* 2+ tabs: the expandable per-tab list. One tab: no list, but still surface its sub-agents. */}
      {multiTab
        ? expanded && (
            <div className="flex flex-col gap-px px-2.5 pt-0 pr-2.5 pb-2.5 pl-[11px]">
              <div className="mb-[7px] h-px bg-[var(--soromi-border-subtle)]" />
              {sessions.map((session) => (
                <AgentRow
                  key={session.id}
                  session={session}
                  label={sessionLabel(session, sessions)}
                  // Only the active workspace's current tab is highlighted, so a non-active
                  // workspace's expanded card doesn't look like it's the one in focus.
                  activeSession={active && session.id === activeSession}
                  onClick={() => onSelectSession(session.id)}
                />
              ))}
            </div>
          )
        : (sessions[0]?.subagents?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-px px-2.5 pt-0 pr-2.5 pb-2.5 pl-[11px]">
              <div className="mb-[7px] h-px bg-[var(--soromi-border-subtle)]" />
              <SubAgentList sessionId={sessions[0].id} subagents={sessions[0].subagents ?? []} />
            </div>
          )}
    </div>
  )
}

/**
 * One agent (session) row inside an expanded workspace card. When the tab has spawned sub-agents, a
 * count + chevron toggles their nested list (each with its own live status dot).
 */
function AgentRow({
  session,
  label,
  activeSession,
  onClick,
}: {
  session: SessionSummary
  label: string
  activeSession: boolean
  onClick: () => void
}) {
  const state = AGENT_STATE[session.status]
  // Bold line: the tab name (title, matching the terminal tab). Gray line: what the provider is
  // working on. Only show it while the agent is actually working, so a finished turn doesn't leave
  // the last tool call ("Reading index.tsx") sitting stale under an idle tab. Status stays on right.
  const subtitle = session.status === 'thinking' ? session.activity : null
  const subagents = session.subagents ?? []
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className={cn(
          'flex items-center rounded-[7px] hover:bg-[var(--soromi-border-subtle)]',
          activeSession && 'bg-[var(--soromi-border-subtle)]',
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 cursor-pointer appearance-none items-center gap-2.5 border-none bg-transparent px-[7px] py-1.5 text-left"
        >
          <Dot color={state.dot} pulse={state.pulse} />
          <div className="min-w-0 flex-1 leading-[1.3]">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[12px] text-[var(--soromi-text-dim)]">
              {label}
            </div>
            {subtitle && (
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--soromi-text-faint)]">
                {subtitle}
              </div>
            )}
          </div>
          <span className="flex-none font-semibold text-[10.5px]" style={{ color: state.dot }}>
            {state.label}
          </span>
        </button>
        {subagents.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title={open ? 'Hide sub-agents' : 'Show sub-agents'}
            className="mr-[7px] ml-1.5 flex flex-none cursor-pointer appearance-none items-center gap-0.5 rounded-[5px] border-none bg-transparent py-0.5 pr-1 pl-1.5 font-medium text-[11px] text-[var(--soromi-text-faint)] hover:text-[var(--soromi-text-dim)]"
          >
            {subagents.length}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn('opacity-75 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {open && <SubAgentList sessionId={session.id} subagents={subagents} />}
    </>
  )
}

/** The sub-agents a tab spawned (Claude Task calls), nested with a connector; the dot is its status. */
function SubAgentList({ sessionId, subagents }: { sessionId: string; subagents: SubAgent[] }) {
  return (
    <>
      {subagents.map((sub, index) => {
        const st = AGENT_STATE[sub.status]
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: positional; same-named sub-agents can repeat.
            key={`${sessionId}:${sub.name}:${index}`}
            className="ml-[13px] flex items-center gap-2 border-[var(--soromi-border-subtle)] border-l py-[3px] pr-[7px] pl-3.5"
          >
            <Dot color={st.dot} pulse={st.pulse} />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-[var(--soromi-text-dim)]">
              {sub.name}
            </span>
          </div>
        )
      })}
    </>
  )
}
