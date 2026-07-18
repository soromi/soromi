import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { useEffect, useRef } from 'react'

//Constants
import { darkTheme } from './code-viewer-theme'

//Styles
import styles from './code-viewer.module.css'

/** Read-only CodeMirror view with a line-number gutter. Language grammars load lazily. */
export function CodeViewer({ value, path }: { value: string; path: string }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment()).current

  // Build the editor once; document and language are swapped by the effects below.
  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          darkTheme,
          language.of([]),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [language])

  // Replace the document when the file content arrives or changes.
  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
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

  return <div ref={host} className={styles.host} />
}

async function loadLanguage(path: string): Promise<Extension> {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
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
