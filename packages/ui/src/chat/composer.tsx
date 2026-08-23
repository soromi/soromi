import { Paperclip, Square } from 'lucide-react'
import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

//Components
import { InputGroup, InputGroupAddon } from '../components/ui/input-group'
import { PromptInputButton, PromptInputSubmit } from '../components/ai-elements/prompt-input'
import { ModelSelect } from './model-select'
import { PermissionSelect } from './permission-select'
import { RichTextInput } from './rich-input'
import { SlashMenu } from './slash-menu'
import { useSlashMenu } from './use-slash-menu'

//Types
import type { RichDraft, RichInputHandle } from './rich-input'
import type { ChatFile, PermissionMode, SlashCommand } from '@soromi/protocol'

// Unsent composer content per session, kept outside React (the daemon owns the session, not the UI).
// Switching chats unmounts the pane, so this preserves your draft — text *and* inline attachment chips
// — across the remount, restoring it when you come back and clearing it once the message is sent.
const drafts = new Map<string, RichDraft>()

export interface ComposerProps {
  disabled: boolean
  working: boolean
  placeholder: string
  onSend: (text: string, files?: ChatFile[]) => void
  onStop?: () => void
  /** The provider's slash commands, for the `/` menu (empty hides it). */
  commands: SlashCommand[]
  permissionMode: PermissionMode
  onPermissionMode?: (mode: PermissionMode) => void
  /** The chat's model + reasoning effort, for the model dropdown. `onModel` absent hides it. */
  model?: string | null
  effort?: string | null
  onModel?: (model: string | null, effort: string | null) => void
  /** The session's account (and its app-rendered provider glyph), shown so it's clear which login
   * this session runs under. Absent hides the badge. */
  account?: string
  accountIcon?: ReactNode
  /** Keys the unsent draft (the session id), so it's preserved across switching chats. */
  draftKey?: string
  /** Placeholder shown while the composer is disabled (defaults to the "take control" hint). */
  disabledLabel?: string
}

/**
 * The chat input: a rich contenteditable editor (`RichTextInput`) where attached images become atomic
 * inline `[image-N]` chips in the prompt text (hover to preview), plus a `/` command menu, a model and
 * permission dropdown, and a send/stop button. Sending is injected via `onSend`; the `/` menu behavior
 * lives in `useSlashMenu` and its look in `SlashMenu`.
 */
export function Composer({
  disabled,
  working,
  placeholder,
  onSend,
  onStop,
  commands,
  permissionMode,
  onPermissionMode,
  model = null,
  effort = null,
  onModel,
  account,
  accountIcon,
  draftKey,
  disabledLabel = 'Take control to reply',
}: ComposerProps) {
  const richRef = useRef<RichInputHandle>(null)
  const [empty, setEmpty] = useState(true)

  // The `/` menu writes the picked command back into the editor via this stable callback.
  const write = useCallback((value: string) => richRef.current?.setText(value), [])
  // The `/` command menu (state + keyboard) lives in this hook; it also tracks the composer text.
  // Gated off while a turn runs so a follow-up starting with "/" isn't hijacked.
  const slash = useSlashMenu(commands, !working, write)
  // With content, the button sends a follow-up (steers the turn); empty while working it stops.
  const hasContent = !empty

  // Restore this session's saved draft on mount (a chat switch remounts the pane).
  useEffect(() => {
    const draft = draftKey ? drafts.get(draftKey) : undefined
    if (draft && draft.length > 0) richRef.current?.loadDraft(draft)
  }, [draftKey])

  const submit = () => {
    if (disabled) return
    const message = richRef.current?.getMessage() ?? { text: '', files: [] }
    const text = message.text.trim()
    if (!text && message.files.length === 0) return
    // Sending while the agent is working steers the current turn (the daemon queues the message on the
    // agent's stdin) — it does not interrupt.
    onSend(text, message.files)
    slash.reset()
    richRef.current?.clear()
    if (draftKey) drafts.delete(draftKey)
  }

  const onSendClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    submit()
  }
  const onStopClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    onStop?.()
  }
  // The Stop button is shown whenever the agent is working — a persistent cancel that's also the
  // clearest "it's busy" signal right where you're typing (the transcript's working indicator is easy
  // to miss). Send stays available so a typed follow-up can still steer the running turn.
  const showStop = working && !!onStop
  const showSend = !working || hasContent

  return (
    <div ref={slash.containerRef} className="relative">
      {slash.open && (
        <SlashMenu
          commands={slash.matches}
          selected={slash.selectedIndex}
          onSelect={slash.apply}
          onHover={slash.setSelected}
        />
      )}
      <InputGroup className="!h-auto flex-col items-stretch overflow-hidden">
        <RichTextInput
          ref={richRef}
          disabled={disabled}
          placeholder={disabled ? disabledLabel : working ? 'Send a follow-up…' : placeholder}
          onSubmit={submit}
          onChange={({ text, empty: isEmpty }) => {
            setEmpty(isEmpty)
            slash.handleChange(text)
            if (draftKey) {
              const draft = richRef.current?.toDraft() ?? []
              if (draft.length > 0) drafts.set(draftKey, draft)
              else drafts.delete(draftKey)
            }
          }}
        />
        <InputGroupAddon align="block-end" className="justify-between gap-1">
          <div className="flex flex-1 items-center gap-1">
            <PromptInputButton
              size="icon-xs"
              className="rounded-md"
              onClick={() => richRef.current?.openFileDialog()}
              title="Attach files"
              disabled={disabled}
            >
              <Paperclip className="size-4" />
            </PromptInputButton>
            {onModel && <ModelSelect model={model} effort={effort} onChange={onModel} />}
            {onPermissionMode && (
              <PermissionSelect mode={permissionMode} onChange={onPermissionMode} />
            )}
            {account && (
              <span
                title={`This session is signed in as the "${account}" account`}
                className="ml-auto flex items-center gap-1.5 rounded-md bg-[var(--soromi-bg-hover)] px-2 py-1 font-medium text-[12px] text-[var(--soromi-text-dim)]"
              >
                {accountIcon}
                {account}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {showStop && (
              <button
                type="button"
                onClick={onStopClick}
                title="Stop the agent (Esc)"
                className="flex size-6 flex-none cursor-pointer appearance-none items-center justify-center rounded-md border border-[var(--soromi-border)] bg-transparent text-[var(--soromi-text-dim)] transition-colors hover:border-[#e08585] hover:text-[#e08585]"
              >
                <Square className="size-3 fill-current" />
              </button>
            )}
            {showSend && (
              <PromptInputSubmit
                size="icon-xs"
                className="rounded-md"
                status="ready"
                onClick={onSendClick}
                disabled={disabled || !hasContent}
              />
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
