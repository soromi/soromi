import { Paperclip } from 'lucide-react'
import { type MouseEvent, type ReactNode, useEffect } from 'react'

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
import { ModelSelect } from './model-select'
import { PermissionSelect } from './permission-select'
import { SlashMenu } from './slash-menu'
import { useSlashMenu } from './use-slash-menu'

//Types
import type { PromptInputMessage } from '../components/ai-elements/prompt-input'
import type { ChatFile, PermissionMode, SlashCommand } from '@soromi/protocol'

// Unsent composer text per session, kept outside React (the daemon owns the session, not the UI).
// Switching chats unmounts the pane, so this preserves your draft across the remount, restoring it
// when you come back and clearing it once the message is sent.
const drafts = new Map<string, string>()

/** Writes a value into the uncontrolled textarea so React/PromptInput see it, moving the caret last. */
function writeTextarea(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.setSelectionRange(value.length, value.length)
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
  /** Keys the unsent-text draft (the session id), so it's preserved across switching chats. */
  draftKey?: string
  /** Placeholder shown while the composer is disabled (defaults to the "take control" hint). */
  disabledLabel?: string
}

/**
 * The chat input: a native-form PromptInput (self-managed textarea + attachments) with a `/` command
 * menu, a permission-mode dropdown, and a send/stop button. Sending is injected via `onSend`; the
 * `/` menu behavior lives in `useSlashMenu` and its look in `SlashMenu`.
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
  // The `/` command menu (state + keyboard) lives in this hook; it also tracks the composer text.
  // Gated off while a turn runs so a follow-up starting with "/" isn't hijacked.
  const slash = useSlashMenu(commands, !working)
  // With text, the button sends a follow-up (steers the turn); empty while working it stops.
  const hasText = slash.value.trim().length > 0

  // Restore this session's saved draft on mount (a chat switch remounts the pane).
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore once per session mount.
  useEffect(() => {
    const draft = draftKey ? drafts.get(draftKey) : undefined
    const el = slash.containerRef.current?.querySelector('textarea')
    if (draft && el) writeTextarea(el, draft)
  }, [draftKey])

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
    slash.reset()
    if (draftKey) drafts.delete(draftKey)
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
    <div ref={slash.containerRef} className="relative">
      {slash.open && (
        <SlashMenu
          commands={slash.matches}
          selected={slash.selectedIndex}
          onSelect={slash.apply}
          onHover={slash.setSelected}
        />
      )}
      <PromptInput onSubmit={submit} accept="image/*,application/pdf,text/*" multiple>
        <PromptInputBody>
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea
            placeholder={
              disabled ? disabledLabel : working ? 'Send a follow-up…' : placeholder
            }
            disabled={disabled}
            onChange={(event) => {
              const next = event.currentTarget.value
              slash.handleChange(next)
              if (draftKey) {
                if (next) drafts.set(draftKey, next)
                else drafts.delete(draftKey)
              }
            }}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <AddFilesButton />
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
          </PromptInputTools>
          <PromptInputSubmit
            status={stopMode ? 'streaming' : 'ready'}
            onClick={onSubmitButtonClick}
            disabled={disabled}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
