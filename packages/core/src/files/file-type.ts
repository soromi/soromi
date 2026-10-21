/** The glyph a file gets. Shape marks the broad category; colour marks the specific type. */
export type FileKind = 'code' | 'doc' | 'image' | 'lock' | 'page'

/** How a file is drawn in a tree: which glyph, and in which colour. */
export interface FileType {
  kind: FileKind
  color: string
}

const MUTED = '#999999'

/** Extension -> glyph + colour. Colours are brightened linguist-ish brand colours (dark-bg legible). */
const BY_EXT: Record<string, FileType> = {
  // Code
  ts: { kind: 'code', color: '#4aa5f0' },
  tsx: { kind: 'code', color: '#4aa5f0' },
  js: { kind: 'code', color: '#f0db4f' },
  jsx: { kind: 'code', color: '#f0db4f' },
  mjs: { kind: 'code', color: '#f0db4f' },
  cjs: { kind: 'code', color: '#f0db4f' },
  rs: { kind: 'code', color: '#ffa07a' },
  go: { kind: 'code', color: '#35c9e8' },
  py: { kind: 'code', color: '#6ca9e0' },
  rb: { kind: 'code', color: '#f06b6b' },
  java: { kind: 'code', color: '#f89820' },
  kt: { kind: 'code', color: '#b98bff' },
  c: { kind: 'code', color: '#78a9d8' },
  h: { kind: 'code', color: '#78a9d8' },
  cpp: { kind: 'code', color: '#78a9d8' },
  cc: { kind: 'code', color: '#78a9d8' },
  hpp: { kind: 'code', color: '#78a9d8' },
  cs: { kind: 'code', color: '#b07bd0' },
  php: { kind: 'code', color: '#9098d8' },
  swift: { kind: 'code', color: '#f88962' },
  sh: { kind: 'code', color: '#8ec16a' },
  bash: { kind: 'code', color: '#8ec16a' },
  zsh: { kind: 'code', color: '#8ec16a' },
  sql: { kind: 'code', color: '#e8a44a' },
  lua: { kind: 'code', color: '#7a8cff' },
  dart: { kind: 'code', color: '#35c9c0' },
  vue: { kind: 'code', color: '#56c98f' },
  svelte: { kind: 'code', color: '#ff6a4d' },
  html: { kind: 'code', color: '#ef6b4a' },
  htm: { kind: 'code', color: '#ef6b4a' },
  css: { kind: 'code', color: '#a78bd0' },
  scss: { kind: 'code', color: '#c98bb4' },
  sass: { kind: 'code', color: '#c98bb4' },
  less: { kind: 'code', color: '#7f9fd0' },
  // Docs / data / config
  md: { kind: 'doc', color: '#6cb0d8' },
  mdx: { kind: 'doc', color: '#6cb0d8' },
  markdown: { kind: 'doc', color: '#6cb0d8' },
  json: { kind: 'doc', color: '#e0d24a' },
  jsonc: { kind: 'doc', color: '#e0d24a' },
  yml: { kind: 'doc', color: '#e05a5a' },
  yaml: { kind: 'doc', color: '#e05a5a' },
  toml: { kind: 'doc', color: '#c47a55' },
  xml: { kind: 'doc', color: '#e89a5a' },
  ini: { kind: 'doc', color: '#cfa84a' },
  cfg: { kind: 'doc', color: '#cfa84a' },
  conf: { kind: 'doc', color: '#cfa84a' },
  env: { kind: 'doc', color: '#cfa84a' },
  csv: { kind: 'doc', color: '#8ec16a' },
  tsv: { kind: 'doc', color: '#8ec16a' },
  txt: { kind: 'doc', color: MUTED },
  log: { kind: 'doc', color: MUTED },
  // Images
  png: { kind: 'image', color: '#b58fd8' },
  jpg: { kind: 'image', color: '#b58fd8' },
  jpeg: { kind: 'image', color: '#b58fd8' },
  gif: { kind: 'image', color: '#b58fd8' },
  webp: { kind: 'image', color: '#b58fd8' },
  bmp: { kind: 'image', color: '#b58fd8' },
  avif: { kind: 'image', color: '#b58fd8' },
  ico: { kind: 'image', color: '#b58fd8' },
  svg: { kind: 'image', color: '#ffbb4d' },
}

/** Exact filenames that override extension matching. */
const BY_NAME: Record<string, FileType> = {
  dockerfile: { kind: 'code', color: '#4aa5f0' },
  '.gitignore': { kind: 'doc', color: MUTED },
  '.gitattributes': { kind: 'doc', color: MUTED },
  '.dockerignore': { kind: 'doc', color: MUTED },
  license: { kind: 'page', color: '#e0d24a' },
  makefile: { kind: 'code', color: '#8ec16a' },
}

/** Lockfiles get the padlock, regardless of extension. */
const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'cargo.lock',
  'poetry.lock',
  'gemfile.lock',
  'composer.lock',
  'bun.lockb',
])

/**
 * A file's type, from its name: a few exact names first, then lockfiles, then the extension. One
 * that matches nothing is a plain page.
 */
export function fileType(name: string): FileType {
  const lower = name.toLowerCase()

  if (BY_NAME[lower]) return BY_NAME[lower]
  if (LOCKFILES.has(lower) || lower.endsWith('.lock')) return { kind: 'lock', color: MUTED }
  if (lower.startsWith('readme')) return { kind: 'doc', color: '#6cb0d8' }

  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  return BY_EXT[ext] ?? { kind: 'page', color: MUTED }
}
