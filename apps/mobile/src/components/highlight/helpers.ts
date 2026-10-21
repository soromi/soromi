import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dart from 'highlight.js/lib/languages/dart'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import less from 'highlight.js/lib/languages/less'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import objectivec from 'highlight.js/lib/languages/objectivec'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scala from 'highlight.js/lib/languages/scala'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

//Constants
import { HIGHLIGHT } from './constants'

//Type
import type { SyntaxScope } from '@/config/theme'
import type { HighlightLine } from './types'

// The languages a phone colours: what is common in a repository. Each is registered once, here,
// and answers to its usual names (`ts`, `tsx`, `rs`, `py`, `yml`, `sh`…) as well.
for (const [name, language] of Object.entries({
  bash,
  c,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  lua,
  makefile,
  markdown,
  objectivec,
  php,
  plaintext,
  python,
  ruby,
  rust,
  scala,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
})) {
  hljs.registerLanguage(name, language)
}

/** The language a code block names (`ts`, `Python`), when it is one the phone colours. */
export const getLanguage = (name: string | null | undefined): string | null => {
  const key = name?.trim().toLowerCase()

  return key && hljs.getLanguage(key) ? key : null
}

/** The language a file is in, from its name: `Dockerfile` by name, `main.rs` by extension. */
export const getPathLanguage = (path: string): string | null => {
  const name = (path.split('/').pop() ?? '').toLowerCase()
  const known = HIGHLIGHT.fileNames[name]
  if (known) return known
  const dot = name.lastIndexOf('.')

  return dot > 0 ? getLanguage(name.slice(dot + 1)) : null
}

/**
 * Code split into lines of coloured runs, in `language`. `null` when it is not one the phone
 * colours, or the code is too long to colour quickly: draw it plain then.
 */
export const highlightLines = (code: string, language: string | null): HighlightLine[] | null => {
  if (!language || code.length > HIGHLIGHT.maxChars) return null
  try {
    const html = hljs.highlight(code, { language, ignoreIllegals: true }).value

    return toLines(html)
  } catch {
    return null
  }
}

/** The highlighter writes HTML: runs of escaped text inside nested `<span class="hljs-…">`. */
const PIECE = /<span class="([^"]+)">|<\/span>|([^<]+)/g
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
}

/** Turns the highlighter's HTML into lines, each run coloured by the innermost span that has one. */
export const toLines = (html: string): HighlightLine[] => {
  const lines: HighlightLine[] = [[]]
  // The open spans' scopes; `undefined` for one that takes its colour from around it.
  const open: Array<SyntaxScope | undefined> = []

  for (const match of html.matchAll(PIECE)) {
    const [whole, className, escaped] = match
    if (className !== undefined) {
      open.push(getScope(className))
    } else if (whole === '</span>') {
      open.pop()
    } else if (escaped !== undefined) {
      const scope = getInnermost(open)
      const parts = decode(escaped).split('\n')
      parts.forEach((text, index) => {
        if (index > 0) lines.push([])
        if (text) push(lines[lines.length - 1], text, scope)
      })
    }
  }

  return lines
}

/** One code block's lines as one run of text, for a block drawn whole rather than line by line. */
export const joinLines = (lines: HighlightLine[]): HighlightLine =>
  lines.flatMap((line, index) => (index === 0 ? line : [{ text: '\n', scope: 'plain' }, ...line]))

const getInnermost = (open: Array<SyntaxScope | undefined>): SyntaxScope => {
  for (let index = open.length - 1; index >= 0; index -= 1) {
    const scope = open[index]
    if (scope) return scope
  }

  return 'plain'
}

/** `hljs-title function_` is `title.function`; the most specific name that has a colour wins. */
const getScope = (className: string): SyntaxScope | undefined => {
  const [first, ...rest] = className.split(' ')
  const names = [first.replace(/^hljs-/, ''), ...rest.map((part) => part.replace(/_+$/, ''))]
  for (let length = names.length; length > 0; length -= 1) {
    const scope = HIGHLIGHT.scopes[names.slice(0, length).join('.')]
    if (scope) return scope
  }

  return undefined
}

const push = (line: HighlightLine, text: string, scope: SyntaxScope) => {
  const kind = scope === 'keyword' && HIGHLIGHT.control.has(text.trim()) ? 'control' : scope
  const last = line[line.length - 1]
  if (last?.scope === kind) last.text += text
  else line.push({ text, scope: kind })
}

const decode = (text: string): string =>
  text.replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => ENTITIES[entity])
