//Styles
import styles from './file-icon.module.css'

//Types
import type { ReactNode } from 'react'

/** The glyph a file gets. Shape marks the broad category; colour marks the specific type. */
type Kind = 'code' | 'doc' | 'image' | 'lock' | 'page'

const MUTED = '#9a9a9e'

/** Extension -> glyph + colour. Colours are brightened linguist-ish brand colours (dark-bg legible). */
const BY_EXT: Record<string, { kind: Kind; color: string }> = {
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
const BY_NAME: Record<string, { kind: Kind; color: string }> = {
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

function resolve(name: string): { kind: Kind; color: string } {
  const lower = name.toLowerCase()

  if (BY_NAME[lower]) return BY_NAME[lower]
  if (LOCKFILES.has(lower) || lower.endsWith('.lock')) return { kind: 'lock', color: MUTED }
  if (lower.startsWith('readme')) return { kind: 'doc', color: '#6cb0d8' }

  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  return BY_EXT[ext] ?? { kind: 'page', color: MUTED }
}

const GLYPH: Record<Kind, ReactNode> = {
  code: (
    <>
      <path d="M9 8.5 5.5 12 9 15.5" />
      <path d="M15 8.5 18.5 12 15 15.5" />
    </>
  ),
  doc: (
    <>
      <path d="M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13 3v5h5" />
      <path d="M9.5 13h5M9.5 16h5" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 17l4-3.5 3 2.5 3.5-3L20 16.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  page: (
    <>
      <path d="M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13 3v5h5" />
    </>
  ),
}

/** A file-type icon, chosen from the filename (extension, or a few exact names). */
export function FileIcon({ name, size = 15 }: { name: string; size?: number }) {
  const { kind, color } = resolve(name)

  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPH[kind]}
    </svg>
  )
}

/** A folder icon for directory rows (the chevron already shows open/closed). */
export function FolderIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--soromi-text-dim)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
