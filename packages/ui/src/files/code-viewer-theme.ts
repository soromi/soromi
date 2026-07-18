import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

// A dark editor theme matching the app's neutral palette, hand-rolled so the app owns its
// colors (no third-party theme dependency).
const background = '#1f1f1f'
const foreground = '#cccccc'
const gutter = '#6e7681'
const cursor = '#aeafad'
const selection = '#264f78'
const activeLine = 'rgba(255, 255, 255, 0.04)'

const chrome = EditorView.theme(
  {
    '&': { color: foreground, backgroundColor: background },
    '.cm-content': { caretColor: cursor },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: cursor },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: selection,
    },
    '.cm-gutters': { backgroundColor: background, color: gutter, border: 'none' },
    '.cm-activeLine': { backgroundColor: activeLine },
    '.cm-activeLineGutter': { backgroundColor: activeLine },
  },
  { dark: true },
)

const highlight = HighlightStyle.define([
  { tag: t.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string)], color: '#ce9178' },
  { tag: [t.number, t.bool, t.null], color: '#b5cea8' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: '#569cd6' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: '#c586c0' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#dcdcaa' },
  { tag: [t.typeName, t.className, t.namespace], color: '#4ec9b0' },
  { tag: [t.variableName, t.propertyName, t.attributeName], color: '#9cdcfe' },
  { tag: t.tagName, color: '#569cd6' },
  { tag: t.constant(t.variableName), color: '#4fc1ff' },
  { tag: t.regexp, color: '#d16969' },
  { tag: [t.meta, t.documentMeta], color: '#9cdcfe' },
  { tag: t.heading, color: '#569cd6', fontWeight: 'bold' },
  { tag: [t.link, t.url], color: '#ce9178' },
  { tag: t.invalid, color: '#f44747' },
])

export const darkTheme: Extension = [chrome, syntaxHighlighting(highlight)]
