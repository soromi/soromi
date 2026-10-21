import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

// The editor's colors are the palette's (`--soromi-code-*`, `--soromi-syntax-*` in theme.css), so
// it follows the app's appearance as every other surface does: Dark+ in the dark, GitHub's light
// theme in the light, with nothing to reconfigure when it changes. Hand-rolled, so the app owns
// its colors (no third-party theme dependency).
const v = (name: string) => `var(--soromi-${name})`

const chrome = EditorView.theme({
  '&': { color: v('code-text'), backgroundColor: v('code-bg') },
  '.cm-content': { caretColor: v('code-cursor') },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('code-cursor') },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: v('code-selection'),
  },
  '.cm-gutters': { backgroundColor: v('code-bg'), color: v('code-gutter'), border: 'none' },
  '.cm-activeLine': { backgroundColor: v('code-active-line') },
  '.cm-activeLineGutter': { backgroundColor: v('code-active-line') },
  '.cm-foldPlaceholder': {
    backgroundColor: v('bg-hover'),
    border: 'none',
    color: v('text-faint'),
  },
})

const highlight = HighlightStyle.define([
  { tag: t.comment, color: v('syntax-comment'), fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string)], color: v('syntax-string') },
  { tag: [t.number, t.bool, t.null], color: v('syntax-number') },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: v('syntax-keyword') },
  { tag: [t.controlKeyword, t.moduleKeyword], color: v('syntax-control') },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: v('syntax-function') },
  { tag: [t.typeName, t.className, t.namespace], color: v('syntax-type') },
  { tag: [t.variableName, t.propertyName, t.attributeName], color: v('syntax-variable') },
  { tag: t.tagName, color: v('syntax-tag') },
  { tag: t.constant(t.variableName), color: v('syntax-constant') },
  { tag: t.regexp, color: v('syntax-regexp') },
  { tag: [t.meta, t.documentMeta], color: v('syntax-variable') },
  { tag: t.heading, color: v('syntax-keyword'), fontWeight: 'bold' },
  { tag: [t.link, t.url], color: v('syntax-string') },
  { tag: t.invalid, color: v('syntax-invalid') },
])

/** The editor's look, in whichever appearance the app is in. */
export const editorTheme: Extension = [chrome, syntaxHighlighting(highlight)]
