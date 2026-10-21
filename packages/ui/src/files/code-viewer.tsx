import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { codeFolding, foldGutter, foldKeymap } from '@codemirror/language'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

//Components
import { Markdown } from '../chat/markdown'

//Utils
import { cn } from '../lib/utils'

//Constants
import { darkTheme } from './code-viewer-theme'

const isMarkdownPath = (path: string) => /\.(md|mdx|markdown)$/i.test(path)

/**
 * File viewer/editor. Code (and markdown's "Raw" mode) renders in CodeMirror — editable when `onSave`
 * is given, otherwise read-only — with a line-number gutter, code folding, and undo history. A
 * markdown file defaults to a rendered **Preview** (streamdown) with a Raw/Preview toggle. `onSave`
 * (⌘S or the Save button) writes the current content back through the caller.
 */
export function CodeViewer({
  value,
  path,
  onSave,
}: {
  value: string
  path: string
  /** Save the edited content. Absent = read-only. */
  onSave?: (content: string) => void
}) {
  const markdown = isMarkdownPath(path)
  const [mode, setMode] = useState<'preview' | 'raw'>(markdown ? 'preview' : 'raw')

  // Reset when the open file changes: a markdown file opens as Preview, code as source.
  useEffect(() => setMode(isMarkdownPath(path) ? 'preview' : 'raw'), [path])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {markdown && (
        <div className="flex flex-none items-center gap-1 border-[var(--soromi-border)] border-b px-3 py-1.5">
          <ModeButton active={mode === 'preview'} onClick={() => setMode('preview')}>
            Preview
          </ModeButton>
          <ModeButton active={mode === 'raw'} onClick={() => setMode('raw')}>
            Raw
          </ModeButton>
        </div>
      )}
      {markdown && mode === 'preview' ? (
        <MarkdownPreview value={value} />
      ) : (
        <SourceView value={value} path={path} onSave={onSave} />
      )}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer appearance-none rounded-md border-none px-2.5 py-1 font-medium text-[12px] transition-colors',
        active
          ? 'bg-[var(--soromi-bg-hover)] text-[var(--soromi-text)]'
          : 'bg-transparent text-[var(--soromi-text-faint)] hover:text-[var(--soromi-text-dim)]',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Rendered markdown in a centered column, at document scale (larger than the chat bubble). The
 * column is wide enough for the tables and code a plan is full of; past it, lines get too long
 * to read, so it stops growing and sits in the middle.
 */
function MarkdownPreview({ value }: { value: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-[1200px] px-8 py-5">
        <Markdown className="!text-[13.5px] [&_h1]:!mt-6 [&_h1]:!text-[23px] [&_h1]:!font-bold [&_h2]:!mt-5 [&_h2]:!text-[18px] [&_h2]:!font-semibold [&_h3]:!mt-4 [&_h3]:!text-[15px] [&_h3]:!font-semibold [&_ol]:!my-3 [&_p]:!my-3 [&_pre]:!my-3 [&_ul]:!my-3">
          {value}
        </Markdown>
      </div>
    </div>
  )
}

/**
 * CodeMirror source view with a line-number gutter, code folding, and (when `onSave` is set) editing
 * with undo history and ⌘S save. "Dirty" is simply the editor text differing from the last-saved
 * `value`, so a successful save (which updates `value`) clears it.
 */
function SourceView({
  value,
  path,
  onSave,
}: {
  value: string
  path: string
  onSave?: (content: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment()).current
  const editable = Boolean(onSave)
  const [dirty, setDirty] = useState(false)

  // The latest `value` (last saved content) and `onSave`, read through refs so the editor — built
  // once — always sees the current ones without being rebuilt.
  const savedValue = useRef(value)
  savedValue.current = value
  const saveHandler = useRef(onSave)
  saveHandler.current = onSave
  // Stable (reads refs), so it can sit in the build-once effect's deps without rebuilding the editor.
  const save = useCallback(() => {
    const editor = view.current
    if (editor) saveHandler.current?.(editor.state.doc.toString())
  }, [])

  // Build the editor once; document and language are swapped by the effects below.
  useEffect(() => {
    if (!host.current) return
    const editing: Extension[] = editable
      ? [
          history(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                save()
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setDirty(update.state.doc.toString() !== savedValue.current)
            }
          }),
        ]
      : [EditorState.readOnly.of(true), EditorView.editable.of(false)]

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        extensions: [
          lineNumbers(),
          codeFolding(),
          foldGutter(),
          keymap.of(foldKeymap),
          darkTheme,
          language.of([]),
          ...editing,
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [language, editable, save])

  // Replace the document when the file content arrives or changes externally — but never while the
  // buffer differs from it, so we don't clobber unsaved edits. A save sets `value` to the buffer, so
  // this is a no-op then (the cursor is preserved).
  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) {
      setDirty(false)
      return
    }
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
    setDirty(false)
  }, [value])

  // Swap the grammar for the file's extension once its chunk is loaded.
  useEffect(() => {
    let cancelled = false
    void loadLanguage(path).then((extension) => {
      if (cancelled || !view.current) return
      view.current.dispatch({ effects: language.reconfigure(extension) })
    })
    return () => {
      cancelled = true
    }
  }, [path, language])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editable && (
        <div className="flex flex-none items-center justify-end gap-2 border-[var(--soromi-border)] border-b px-3 py-1.5">
          <span className="mr-auto text-[11px] text-[var(--soromi-text-faint)]">
            {dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            title="Save (⌘S)"
            className={cn(
              'flex cursor-pointer appearance-none items-center gap-1.5 rounded-md border-none px-2.5 py-1 font-medium text-[12px] transition-colors',
              dirty
                ? 'bg-[var(--soromi-accent)] text-[var(--soromi-accent-on)] hover:opacity-90'
                : 'cursor-default bg-[var(--soromi-bg-hover)] text-[var(--soromi-text-faint)]',
            )}
          >
            {dirty && (
              <span className="h-[6px] w-[6px] flex-none rounded-full bg-[var(--soromi-accent-on)]" />
            )}
            Save
          </button>
        </div>
      )}
      <div
        ref={host}
        className="min-h-0 flex-1 overflow-hidden text-[12.5px] [&_.cm-editor]:h-full [&_.cm-editor]:[font-family:var(--soromi-font-mono)] [&_.cm-scroller]:overflow-auto"
      />
    </div>
  )
}

async function loadLanguage(path: string): Promise<Extension> {
  const base = path.split('/').pop()?.toLowerCase() ?? ''
  // Dockerfiles have no extension (`Dockerfile`, `Dockerfile.base`, …); match by name.
  if (base === 'dockerfile' || base.startsWith('dockerfile.') || base.endsWith('.dockerfile')) {
    return dockerfile().catch(() => [])
  }
  const ext = base.includes('.') ? (base.split('.').pop() ?? '') : ''
  const loader = LANGUAGE_LOADERS[ext]
  if (!loader) return []
  try {
    return await loader()
  } catch {
    // Highlighting is best-effort; a plain gutter view is still useful.
    return []
  }
}

async function shell(): Promise<Extension> {
  const { StreamLanguage } = await import('@codemirror/language')
  const { shell: mode } = await import('@codemirror/legacy-modes/mode/shell')
  return StreamLanguage.define(mode)
}

async function toml(): Promise<Extension> {
  const { StreamLanguage } = await import('@codemirror/language')
  const { toml: mode } = await import('@codemirror/legacy-modes/mode/toml')
  return StreamLanguage.define(mode)
}

async function dockerfile(): Promise<Extension> {
  const { StreamLanguage } = await import('@codemirror/language')
  const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile')
  return StreamLanguage.define(dockerFile)
}

const LANGUAGE_LOADERS: Record<string, () => Promise<Extension>> = {
  ts: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  tsx: async () =>
    (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }),
  js: async () => (await import('@codemirror/lang-javascript')).javascript(),
  jsx: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  mjs: async () => (await import('@codemirror/lang-javascript')).javascript(),
  cjs: async () => (await import('@codemirror/lang-javascript')).javascript(),
  json: async () => (await import('@codemirror/lang-json')).json(),
  md: async () => (await import('@codemirror/lang-markdown')).markdown(),
  css: async () => (await import('@codemirror/lang-css')).css(),
  scss: async () => (await import('@codemirror/lang-css')).css(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  py: async () => (await import('@codemirror/lang-python')).python(),
  rs: async () => (await import('@codemirror/lang-rust')).rust(),
  go: async () => (await import('@codemirror/lang-go')).go(),
  sql: async () => (await import('@codemirror/lang-sql')).sql(),
  yml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  yaml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  c: async () => (await import('@codemirror/lang-cpp')).cpp(),
  h: async () => (await import('@codemirror/lang-cpp')).cpp(),
  cpp: async () => (await import('@codemirror/lang-cpp')).cpp(),
  sh: shell,
  bash: shell,
  zsh: shell,
  toml,
}
