import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { TerminalSurface, useClientStore, useTransport } from '@soromi/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Constants
import { colors } from '@/config/theme'

/**
 * The Terminal tab in the Explorer: ad-hoc shell terminals as sub-tabs, each rooted at a chosen
 * workspace folder (or the root). Shells are plain PTYs (no agent) keyed by their own `shell:<uuid>`
 * ids and reuse the shared `TerminalSurface`. They live only for the app session — not persisted.
 */
export function TerminalPanel() {
  const transport = useTransport()
  const { active, shellList, activeShell } = useAppStore(
    useShallow((s) => ({
      active: s.active,
      // Return the stored array (or undefined) as-is — never a fresh `[]`, or useShallow would see a
      // new value every render and loop forever. Default to [] in the body below.
      shellList: s.active ? s.shells[s.active] : undefined,
      activeShell: s.active ? s.activeShell[s.active] : undefined,
    })),
  )
  const shells = shellList ?? []
  // The workspace's folders come from the client store (root + relative folders).
  const workspace = useClientStore((c) => c.workspaces.find((w) => w.name === active))
  const { openShell, closeShell, selectShell, renameShell } = useAppStore(
    useShallow((s) => ({
      openShell: s.openShell,
      closeShell: s.closeShell,
      selectShell: s.selectShell,
      renameShell: s.renameShell,
    })),
  )
  // The shell being renamed inline (double-click its tab), and the draft text.
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null)

  if (!active) {
    return (
      <div className="px-2 py-1 text-[var(--soromi-text-faint)]">
        Open a workspace to start a terminal.
      </div>
    )
  }

  // Root plus each of the workspace's real folders (a folder of "." means the root itself).
  const folderChoices = [
    { label: 'root', folder: '' },
    ...(workspace?.folders ?? [])
      .filter((f) => f !== '.' && f !== '')
      .map((f) => ({ label: f.split('/').pop() ?? f, folder: f })),
  ]

  const create = (folder: string) => {
    const id = openShell(active, folder)
    transport.send({ type: 'open-shell', workspace: active, shell: id, folder })
  }
  const createDefault = () => create(folderChoices[0]?.folder ?? '')
  const close = (id: string) => {
    closeShell(active, id)
    transport.send({ type: 'close-session', session: id })
  }
  const commitRename = () => {
    if (editing) renameShell(active, editing.id, editing.draft)
    setEditing(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sub-tab strip: one chip per shell + a New button (with a folder menu). */}
      <div className="flex flex-none items-center gap-1 overflow-x-auto px-1 pb-1.5">
        {shells.map((shell) => (
          <div
            key={shell.id}
            className={cn(
              'group flex flex-none items-center gap-1 rounded-md pr-1 pl-2 text-[12px] hover:bg-[var(--soromi-bg-hover)]',
              shell.id === activeShell
                ? 'bg-[var(--soromi-bg-hover)] text-[var(--soromi-text)]'
                : 'text-[var(--soromi-text-faint)]',
            )}
          >
            {editing?.id === shell.id ? (
              <input
                type="text"
                value={editing.draft}
                // Focus (and select) the field when the inline editor appears.
                ref={(el) => {
                  if (el && document.activeElement !== el) {
                    el.focus()
                    el.select()
                  }
                }}
                onChange={(e) => setEditing({ id: shell.id, draft: e.target.value })}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  else if (e.key === 'Escape') setEditing(null)
                }}
                // Stop the click from bubbling to select while editing.
                onClick={(e) => e.stopPropagation()}
                className="w-[90px] appearance-none rounded-[4px] border-none bg-[var(--soromi-bg-tab)] px-1 py-0.5 text-[12px] text-[var(--soromi-text)] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => selectShell(active, shell.id)}
                onDoubleClick={() => setEditing({ id: shell.id, draft: shell.title })}
                title="Double-click to rename"
                className="max-w-[90px] cursor-pointer appearance-none truncate border-none bg-transparent py-1 text-inherit"
              >
                {shell.title}
              </button>
            )}
            <button
              type="button"
              title="Close terminal"
              onClick={() => close(shell.id)}
              className="flex h-[14px] w-[14px] flex-none cursor-pointer items-center justify-center rounded-[4px] border-none bg-transparent text-[var(--soromi-text-faint)] opacity-0 hover:bg-[var(--soromi-bg-tab)] hover:text-[var(--soromi-text)] group-hover:opacity-100"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}

        {folderChoices.length <= 1 ? (
          <button
            type="button"
            title="New terminal"
            onClick={createDefault}
            className="flex h-[24px] flex-none cursor-pointer appearance-none items-center gap-1 rounded-md border-none bg-transparent px-1.5 text-[12px] text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
          >
            <PlusGlyph />
            New
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="New terminal"
                className="flex h-[24px] flex-none cursor-pointer appearance-none items-center gap-1 rounded-md border-none bg-transparent px-1.5 text-[12px] text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
              >
                <PlusGlyph />
                New
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[180px]">
              {folderChoices.map((choice) => (
                <DropdownMenuItem
                  key={choice.folder || 'root'}
                  onSelect={() => create(choice.folder)}
                >
                  {choice.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Panes: all shells stay mounted (parked) so scrollback survives tab switches. A flex column,
          like the deck, so each `TerminalSurface` pane (flex:1) fills and hidden ones collapse. */}
      <div className="relative isolate flex min-h-0 flex-1 flex-col">
        {shells.length === 0 ? (
          <div className="px-2 py-1 text-[var(--soromi-text-faint)]">
            No terminals yet — click New.
          </div>
        ) : (
          shells.map((shell) => (
            <TerminalSurface
              key={shell.id}
              transport={transport}
              session={shell.id}
              active={shell.id === activeShell}
              background={colors.bgTerminal}
              foreground={colors.text}
              fontSize={12}
            />
          ))
        )}
      </div>
    </div>
  )
}

function PlusGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
