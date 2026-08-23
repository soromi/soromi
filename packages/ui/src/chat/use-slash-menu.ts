import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

//Types
import type { SlashCommand } from '@soromi/protocol'

/** The command query while typing a slash command: the text after a leading `/` with no space yet
 * (e.g. "re" for "/re"), or null when the input isn't a bare slash command. */
function slashQuery(value: string): string | null {
  const match = /^\/(\S*)$/.exec(value)
  return match ? match[1] : null
}

export interface SlashMenuState {
  /** Attach to the composer wrapper: scopes the capture-phase key interception. */
  containerRef: React.RefObject<HTMLDivElement>
  /** Current composer text (tracked here so the caller derives things like "has text"). */
  value: string
  /** Whether the `/` menu should render. */
  open: boolean
  /** Commands matching the current query (what the menu lists). */
  matches: SlashCommand[]
  /** The highlighted row (clamped to `matches`). */
  selectedIndex: number
  /** Highlights a row (mouse hover). */
  setSelected: (index: number) => void
  /** Inserts a command into the composer and closes the menu. */
  apply: (command: SlashCommand) => void
  /** Feed every textarea change here (re-opens the menu and resets the highlight). */
  handleChange: (value: string) => void
  /** Clears tracked state after a submit. */
  reset: () => void
}

/**
 * Drives the chat composer's `/` command menu: tracks the composer text, filters `commands` by the
 * typed query, and intercepts navigation keys (arrows / enter / tab / escape) in the capture phase so
 * they beat the editor's own Enter-to-submit. `enabled` gates it off (e.g. while a turn runs). `write`
 * replaces the composer text with the picked command (editor-agnostic — the caller owns the input).
 * Pure behavior; the menu's look lives in `SlashMenu`.
 */
export function useSlashMenu(
  commands: SlashCommand[],
  enabled: boolean,
  write: (value: string) => void,
): SlashMenuState {
  const containerRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  const [selected, setSelected] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const query = enabled && commands.length > 0 ? slashQuery(value) : null
  const matches = useMemo(() => {
    if (query === null) return []
    const q = query.toLowerCase()
    return commands.filter((command) => command.name.toLowerCase().startsWith(q))
  }, [commands, query])
  const open = matches.length > 0 && !dismissed
  const selectedIndex = Math.min(selected, Math.max(0, matches.length - 1))

  const apply = useCallback(
    (command: SlashCommand) => {
      // Trailing space so the user can type arguments right after the command.
      write(`/${command.name} `)
      setValue(`/${command.name} `)
      setDismissed(true)
    },
    [write],
  )

  // Navigation must run before the textarea's own key handling (its Enter submits the form), so we
  // intercept in the capture phase on the container and stop the event when we consume it.
  useEffect(() => {
    const node = containerRef.current
    if (!node || !open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        setSelected((i) => (i + 1) % matches.length)
      } else if (event.key === 'ArrowUp') {
        setSelected((i) => (i - 1 + matches.length) % matches.length)
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        apply(matches[selectedIndex])
      } else if (event.key === 'Escape') {
        setDismissed(true)
      } else {
        return
      }
      event.preventDefault()
      event.stopPropagation()
    }
    node.addEventListener('keydown', onKeyDown, true)
    return () => node.removeEventListener('keydown', onKeyDown, true)
  }, [open, matches, selectedIndex, apply])

  return {
    containerRef,
    value,
    open,
    matches,
    selectedIndex,
    setSelected,
    apply,
    handleChange: (next: string) => {
      setValue(next)
      // A fresh keystroke re-opens the menu (undoes an Escape) and resets the highlight.
      setDismissed(false)
      setSelected(0)
    },
    reset: () => {
      setValue('')
      setDismissed(false)
      setSelected(0)
    },
  }
}
