import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileText,
  FileVideo,
} from 'lucide-react'
import type { ComponentType } from 'react'

//Types
import type { ChatFile } from '@soromi/protocol'

/**
 * A message's attachments, rendered by format. Images tile into a thumbnail grid; every other kind
 * gets a chip whose look (icon, accent, inline preview) is chosen from what the file actually is —
 * a PDF, a source file, audio/video, an archive, or an unknown blob. Split into small per-kind
 * components so a new format is a matter of adding one classifier branch + one preview.
 */
export function MessageAttachments({ files }: { files: ChatFile[] }) {
  if (files.length === 0) return null
  const images = files.filter((file) => kindOf(file) === 'image')
  const rest = files.filter((file) => kindOf(file) !== 'image')

  return (
    <>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((file, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: attachments have no stable id.
            <ImagePreview key={index} file={file} />
          ))}
        </div>
      )}
      {rest.map((file, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: attachments have no stable id.
        <FilePreview key={index} file={file} />
      ))}
    </>
  )
}

// ---- classification --------------------------------------------------------

/** The coarse formats we give a distinct preview to. */
export type FileKind = 'image' | 'pdf' | 'code' | 'text' | 'audio' | 'video' | 'archive' | 'file'

// Extensions worth recognizing when the MIME type is missing or generic (agents often send
// `application/octet-stream` for source files).
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'rs', 'go', 'py', 'rb', 'java', 'kt', 'swift', 'c', 'h',
  'cc', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'html', 'css', 'scss', 'vue', 'svelte',
  'json', 'yaml', 'yml', 'toml', 'xml', 'lua', 'dart', 'ex', 'exs', 'scala', 'clj',
])
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'mdx', 'log', 'csv', 'tsv', 'env', 'ini', 'cfg', 'conf'])
const ARCHIVE_EXTENSIONS = new Set(['zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2', 'xz'])

function extensionOf(filename?: string): string {
  if (!filename) return ''
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

/** Classify a file by its MIME type, falling back to its extension for the common generic types. */
export function kindOf(file: ChatFile): FileKind {
  const type = file.mediaType.toLowerCase()
  const ext = extensionOf(file.filename)

  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (
    type.includes('zip') ||
    type.includes('compressed') ||
    type.includes('tar') ||
    ARCHIVE_EXTENSIONS.has(ext)
  ) {
    return 'archive'
  }
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (type.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text'
  return 'file'
}

/** Whether a kind is worth inlining a short text snippet for. */
const isTextual = (kind: FileKind) => kind === 'code' || kind === 'text'

// ---- presentation ----------------------------------------------------------

const dataUrl = (file: ChatFile) => `data:${file.mediaType};base64,${file.data}`

/** Rough decoded byte size from the base64 length (no size travels with the file). */
function byteSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** Decode a base64 payload to UTF-8 text (for the code/text snippet preview). */
function decodeText(base64: string): string {
  try {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

/** Icon + accent per kind — the visual language that tells formats apart at a glance. */
const KIND_META: Record<Exclude<FileKind, 'image'>, { icon: ComponentType<{ className?: string }>; accent: string }> = {
  pdf: { icon: FileText, accent: 'text-[#e08585]' },
  code: { icon: FileCode, accent: 'text-[var(--soromi-accent)]' },
  text: { icon: FileText, accent: 'text-[#8fa2c4]' },
  audio: { icon: FileAudio, accent: 'text-[#c99bd8]' },
  video: { icon: FileVideo, accent: 'text-[#e0b341]' },
  archive: { icon: FileArchive, accent: 'text-[#c4a06a]' },
  file: { icon: FileIcon, accent: 'text-[var(--soromi-text-faint)]' },
}

/** An image attachment: a square thumbnail (hover for the filename). */
export function ImagePreview({ file }: { file: ChatFile }) {
  return (
    <img
      src={dataUrl(file)}
      alt={file.filename ?? 'attachment'}
      title={file.filename ?? undefined}
      className="h-24 w-24 rounded-lg border border-[var(--soromi-border)] object-cover"
    />
  )
}

/** A non-image attachment: an icon + name + size chip, with a small inline snippet for text/code. */
export function FilePreview({ file }: { file: ChatFile }) {
  const kind = kindOf(file)
  if (kind === 'image') return <ImagePreview file={file} />
  const { icon: Icon, accent } = KIND_META[kind]
  const name = file.filename ?? file.mediaType
  const size = file.data ? formatBytes(byteSize(file.data)) : null
  const snippet = isTextual(kind) ? decodeText(file.data).trim() : ''

  return (
    <div className="flex max-w-full flex-col gap-1.5 self-start rounded-lg border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 flex-none ${accent}`} />
        <span className="min-w-0 truncate text-[12.5px] text-[var(--soromi-text-dim)]">{name}</span>
        {size && <span className="flex-none text-[11px] text-[var(--soromi-text-faint)]">{size}</span>}
      </div>
      {snippet && (
        <pre className="max-h-24 max-w-[360px] overflow-hidden whitespace-pre-wrap break-words rounded-md bg-[var(--soromi-bg-hover)] px-2 py-1.5 text-[11.5px] leading-[1.45] text-[var(--soromi-text-faint)] [font-family:var(--soromi-font-mono)]">
          {snippet.slice(0, 500)}
        </pre>
      )}
    </div>
  )
}
