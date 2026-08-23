import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

//Types
import type { ChatFile } from '@soromi/protocol'

/**
 * One item of a serialized draft: either a run of plain text or an attached file (kept so a chat
 * switch can rebuild the editor with its inline chips intact — the in-memory draft is cleared on send).
 */
export type RichDraftNode = { text: string } | { file: ChatFile; kind: ChipKind }
export type RichDraft = RichDraftNode[]

type ChipKind = 'image' | 'file'

/** Imperative handle the Composer drives (insert files at the caret, read the message out, etc.). */
export interface RichInputHandle {
  focus: () => void
  clear: () => void
  /** Insert a chip (and attachment) for each file at the caret. */
  addFiles: (files: File[] | FileList) => void
  /** Opens the native file picker (kept inside the user gesture for WKWebView). */
  openFileDialog: () => void
  /** The message to send: text with inline `[image-N]` / `[file-N]` tokens + the ordered files. */
  getMessage: () => { text: string; files: ChatFile[] }
  /** Replace all content with plain text (used by the `/` command menu). */
  setText: (value: string) => void
  /** Snapshot for draft persistence. */
  toDraft: () => RichDraft
  /** Rebuild from a draft snapshot. */
  loadDraft: (draft: RichDraft) => void
}

export interface RichInputProps {
  placeholder?: string
  disabled?: boolean
  className?: string
  accept?: string
  /** The MIME types treated as inline images (thumbnail chip); others get a file chip. */
  onChange?: (info: { text: string; empty: boolean }) => void
  /** Enter (no shift/alt) with the menu closed — the Composer decides whether to send. */
  onSubmit?: () => void
}

// Tailwind class strings live as literals so the content scanner keeps them (chips are built by hand,
// not JSX, so these must appear verbatim in source).
const CHIP_CLASS =
  'soromi-chip mx-0.5 inline-flex translate-y-[3px] cursor-pointer select-none items-center gap-1 rounded-md border border-[var(--soromi-border)] bg-[var(--soromi-bg-hover)] px-1.5 py-0.5 align-baseline font-medium text-[12px] text-[var(--soromi-accent)] [font-family:var(--soromi-font-mono)]'
const CHIP_THUMB_CLASS = 'h-3.5 w-3.5 rounded-[3px] object-cover'

const dataUrl = (file: ChatFile) => `data:${file.mediaType};base64,${file.data}`
const chipKind = (mediaType: string): ChipKind =>
  mediaType.startsWith('image/') ? 'image' : 'file'

/** Reads a File to base64 `data` + its MIME type (the shape the agent wants). */
function readFile(file: File): Promise<ChatFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const url = String(reader.result ?? '')
      const comma = url.indexOf(',')
      resolve({
        mediaType: file.type || 'application/octet-stream',
        data: comma >= 0 ? url.slice(comma + 1) : '',
        filename: file.name || undefined,
      })
    }
    reader.readAsDataURL(file)
  })
}

/**
 * The chat prompt editor: a contenteditable surface where typed text and **atomic inline chips** for
 * attached files coexist — mirroring Claude Code's terminal, where a picture shows up as an `[image-1]`
 * token inside the prompt. Chips are `contenteditable=false` DOM nodes (one indivisible unit; backspace
 * removes the whole thing), each tied to a `ChatFile` held in a ref. Hovering a chip pops a preview.
 *
 * The DOM is the source of truth for text + caret (React never re-renders the editable body — that
 * would fight the browser's caret); React state only drives the hover preview. On every mutation we
 * reconcile: drop attachments whose chip was deleted, then renumber the surviving chips (`image-1`,
 * `image-2`, …). `getMessage` walks the nodes in order to produce the sent text + ordered files.
 */
export const RichTextInput = forwardRef<RichInputHandle, RichInputProps>(function RichTextInput(
  { placeholder, disabled, className, accept = 'image/*,application/pdf,text/*', onChange, onSubmit },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // id -> file data. Chips reference their attachment by a `data-att-id`; this ref is the store.
  const filesRef = useRef<Map<string, ChatFile>>(new Map())
  // Monotonic id source (Math.random is unavailable in some runtimes; a counter is enough + stable).
  const seqRef = useRef(0)
  // Last caret position seen inside the editor, so async file reads still insert where the user was.
  const savedRange = useRef<Range | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [preview, setPreview] = useState<{ file: ChatFile; rect: DOMRect } | null>(null)

  const newId = () => `att-${(seqRef.current += 1)}`

  // ---- serialization -------------------------------------------------------

  const walk = useCallback((node: Node, out: { text: string; files: ChatFile[] }) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out.text += child.textContent ?? ''
        return
      }
      if (!(child instanceof HTMLElement)) return
      const attId = child.dataset.attId
      if (attId) {
        const file = filesRef.current.get(attId)
        if (file) {
          out.text += `[${child.dataset.kind}-${child.dataset.index}]`
          out.files.push(file)
        }
        return
      }
      if (child.tagName === 'BR') {
        out.text += '\n'
        return
      }
      // A block element (contenteditable wraps lines in <div>) starts a new line.
      if (out.text && !out.text.endsWith('\n')) out.text += '\n'
      walk(child, out)
    })
  }, [])

  const getMessage = useCallback(() => {
    const out = { text: '', files: [] as ChatFile[] }
    if (editorRef.current) walk(editorRef.current, out)
    return { text: out.text.trim(), files: out.files }
  }, [walk])

  // ---- reconcile: prune removed chips, renumber survivors, recompute empty --

  // `onChange` is read through a ref so `reconcile` can stay stable and be attached as a *native*
  // input listener (React's onInput/onChange is unreliable on contentEditable — it silently misses
  // typing, which is why the `/` menu never opened).
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const reconcile = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const chips = Array.from(editor.querySelectorAll<HTMLElement>('[data-att-id]'))
    const present = new Set<string>()
    const counts: Record<ChipKind, number> = { image: 0, file: 0 }
    for (const chip of chips) {
      const id = chip.dataset.attId
      if (!id) continue
      present.add(id)
      const kind = (chip.dataset.kind as ChipKind) ?? 'file'
      const index = (counts[kind] += 1)
      chip.dataset.index = String(index)
      const label = chip.querySelector('[data-chip-label]')
      if (label) label.textContent = `${kind}-${index}`
    }
    // Drop attachments whose chip is gone (deleted by the user).
    for (const id of filesRef.current.keys()) {
      if (!present.has(id)) filesRef.current.delete(id)
    }
    const message = getMessage()
    const empty = message.text.length === 0 && message.files.length === 0
    setIsEmpty(empty)
    onChangeRef.current?.({ text: message.text, empty })
  }, [getMessage])

  // Native input listener — the reliable way to catch every edit of a contentEditable.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.addEventListener('input', reconcile)
    return () => editor.removeEventListener('input', reconcile)
  }, [reconcile])

  // ---- chip construction + insertion --------------------------------------

  const buildChip = useCallback((id: string, file: ChatFile) => {
    const kind = chipKind(file.mediaType)
    const chip = document.createElement('span')
    chip.dataset.attId = id
    chip.dataset.kind = kind
    chip.contentEditable = 'false'
    chip.className = CHIP_CLASS
    chip.title = file.filename ?? file.mediaType
    if (kind === 'image') {
      const img = document.createElement('img')
      img.src = dataUrl(file)
      img.alt = ''
      img.className = CHIP_THUMB_CLASS
      chip.appendChild(img)
    }
    const label = document.createElement('span')
    label.dataset.chipLabel = ''
    label.textContent = kind // reconcile() renumbers this immediately
    chip.appendChild(label)
    return chip
  }, [])

  const insertNodes = useCallback((nodes: Node[]) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    let range = savedRange.current
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      // No known caret inside the editor — append at the end.
      range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
    }
    range.deleteContents()
    // Insert in order, keeping the caret after the last inserted node.
    for (const node of nodes) {
      range.insertNode(node)
      range.setStartAfter(node)
      range.collapse(true)
    }
    sel?.removeAllRanges()
    sel?.addRange(range)
    savedRange.current = range.cloneRange()
  }, [])

  const addFiles = useCallback(
    (files: File[] | FileList) => {
      const list = Array.from(files)
      if (list.length === 0) return
      Promise.all(list.map(readFile))
        .then((chatFiles) => {
          const nodes: Node[] = []
          for (const file of chatFiles) {
            if (!file.data) continue
            const id = newId()
            filesRef.current.set(id, file)
            nodes.push(buildChip(id, file))
            nodes.push(document.createTextNode(' '))
          }
          if (nodes.length === 0) return
          insertNodes(nodes)
          reconcile()
        })
        .catch(() => {
          /* a file that fails to read is simply skipped */
        })
    },
    [buildChip, insertNodes, reconcile],
  )

  // ---- draft persistence ---------------------------------------------------

  const toDraft = useCallback((): RichDraft => {
    const editor = editorRef.current
    if (!editor) return []
    const draft: RichDraft = []
    const pushText = (text: string) => {
      if (!text) return
      const last = draft[draft.length - 1]
      if (last && 'text' in last) last.text += text
      else draft.push({ text })
    }
    const visit = (node: Node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          pushText(child.textContent ?? '')
          return
        }
        if (!(child instanceof HTMLElement)) return
        const attId = child.dataset.attId
        if (attId) {
          const file = filesRef.current.get(attId)
          if (file) draft.push({ file, kind: (child.dataset.kind as ChipKind) ?? 'file' })
          return
        }
        if (child.tagName === 'BR') {
          pushText('\n')
          return
        }
        const last = draft[draft.length - 1]
        if (last && 'text' in last && !last.text.endsWith('\n')) pushText('\n')
        visit(child)
      })
    }
    visit(editor)
    return draft
  }, [])

  const loadDraft = useCallback(
    (draft: RichDraft) => {
      const editor = editorRef.current
      if (!editor) return
      editor.textContent = ''
      filesRef.current.clear()
      for (const node of draft) {
        if ('text' in node) {
          // Preserve newlines as <br> so the caret/lines round-trip.
          const parts = node.text.split('\n')
          parts.forEach((part, i) => {
            if (part) editor.appendChild(document.createTextNode(part))
            if (i < parts.length - 1) editor.appendChild(document.createElement('br'))
          })
        } else {
          const id = newId()
          filesRef.current.set(id, node.file)
          editor.appendChild(buildChip(id, node.file))
          editor.appendChild(document.createTextNode(' '))
        }
      }
      reconcile()
    },
    [buildChip, reconcile],
  )

  // ---- imperative handle ---------------------------------------------------

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editorRef.current?.focus(),
      clear: () => {
        if (editorRef.current) editorRef.current.textContent = ''
        filesRef.current.clear()
        savedRange.current = null
        reconcile()
      },
      addFiles,
      openFileDialog: () => fileInputRef.current?.click(),
      getMessage,
      setText: (value: string) => {
        const editor = editorRef.current
        if (!editor) return
        editor.textContent = value
        filesRef.current.clear()
        // Caret to the end.
        const sel = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
        savedRange.current = range.cloneRange()
        editor.focus()
        reconcile()
      },
      toDraft,
      loadDraft,
    }),
    [addFiles, getMessage, reconcile, toDraft, loadDraft],
  )

  // ---- selection tracking (so async inserts land at the caret) -------------

  useEffect(() => {
    const onSelectionChange = () => {
      const editor = editorRef.current
      const sel = window.getSelection()
      if (!editor || !sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (editor.contains(range.commonAncestorContainer)) {
        savedRange.current = range.cloneRange()
      }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  // ---- key + paste handling ------------------------------------------------

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      if (event.nativeEvent.isComposing) return
      // Shift/Alt+Enter insert a line break instead of sending (matches the textarea behavior).
      if (event.shiftKey || event.altKey) {
        event.preventDefault()
        document.execCommand('insertLineBreak')
        return
      }
      event.preventDefault()
      onSubmit?.()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const clipboard = event.clipboardData
    if (!clipboard) return
    const files: File[] = []
    for (const item of clipboard.items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      event.preventDefault()
      addFiles(files)
      return
    }
    // Plain-text paste only — strip any rich HTML so the editor stays predictable.
    const text = clipboard.getData('text/plain')
    event.preventDefault()
    document.execCommand('insertText', false, text)
  }

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) addFiles(event.currentTarget.files)
    event.currentTarget.value = ''
  }

  // ---- chip hover preview --------------------------------------------------

  const chipFrom = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof HTMLElement)) return null
    return target.closest('[data-att-id]')
  }
  const showPreview = (chip: HTMLElement) => {
    const id = chip.dataset.attId
    const file = id ? filesRef.current.get(id) : undefined
    if (file) setPreview({ file, rect: chip.getBoundingClientRect() })
  }
  const onPointerOver = (event: PointerEvent<HTMLDivElement>) => {
    const chip = chipFrom(event.target)
    if (chip) showPreview(chip)
  }
  const onPointerOut = (event: PointerEvent<HTMLDivElement>) => {
    const chip = chipFrom(event.target)
    const next = chipFrom(event.relatedTarget)
    if (chip && next !== chip) setPreview(null)
  }
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const chip = chipFrom(event.target)
    if (chip) showPreview(chip)
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        aria-label="Attach files"
        onChange={onFileInputChange}
      />
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
        className={[
          'relative max-h-48 min-h-[3.5rem] w-full overflow-y-auto whitespace-pre-wrap break-words px-3.5 py-3 text-[14px] leading-[1.5] outline-none',
          isEmpty &&
            'before:pointer-events-none before:absolute before:left-3.5 before:top-3 before:text-[var(--soromi-text-faint)] before:content-[attr(data-placeholder)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {preview &&
        createPortal(
          <ChipPreview file={preview.file} rect={preview.rect} />,
          document.body,
        )}
    </div>
  )
})

/** The floating card shown while hovering (or after clicking) a chip: image thumbnail + filename. */
function ChipPreview({ file, rect }: { file: ChatFile; rect: DOMRect }) {
  const isImage = file.mediaType.startsWith('image/')
  // Anchor above the chip, clamped to the viewport.
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - 320))
  const bottom = window.innerHeight - rect.top + 8
  return (
    <div
      className="fixed z-[var(--z-popover)] w-auto max-w-[300px] rounded-[10px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] p-2 shadow-[0_12px_40px_rgb(0_0_0/45%)]"
      style={{ left, bottom }}
    >
      {isImage && (
        <img
          src={dataUrl(file)}
          alt={file.filename ?? 'attachment'}
          className="max-h-64 max-w-[284px] rounded-md object-contain"
        />
      )}
      <div className="mt-1.5 truncate px-0.5 text-[12px] text-[var(--soromi-text-dim)]">
        {file.filename ?? file.mediaType}
      </div>
    </div>
  )
}
