import { fileType, splitPath } from '@soromi/core'

//Config
import { routes } from '@/config/router'

//Constants
import { FILES } from './constants/files'

//Type
import type { FileNode } from '@soromi/core'
import type { Href } from 'expo-router'
import type { HighlightLine, IconName } from '@/components'
import type { FileContent, FileSave } from '@/states/workspace/workspace.state.type'
import type { CodeLine, FileIconLook, FileStatus } from './types'

export const getNodeKey = (node: FileNode): string => node.path

export const getLineKey = (line: CodeLine): string => line.key

/** The arrow in front of a folder: down when it is open, right when it is closed. */
export const getChevron = (node: FileNode): IconName =>
  node.expanded ? 'chevron-down' : 'chevron-right'

/** A file's icon and colour, by its type: the same types and colours as the desktop's tree. */
export const getFileIcon = (name: string): FileIconLook => {
  const type = fileType(name)

  return { icon: FILES.icons[type.kind], color: type.color }
}

/** Where a file is shown. */
export const getFileHref = (workspace: string, path: string): Href => ({
  pathname: routes.app.file,
  params: { name: workspace, path },
})

/**
 * Where a file is on the computer: its workspace's folder, then its path within it. Until the
 * folder is known, the path within the workspace is all there is.
 */
export const getAbsolutePath = (root: string | undefined, path: string): string =>
  root ? `${root.replace(/\/+$/, '')}/${path}` : path

/** A file's name, without the folders it sits in. */
export const getFileName = (path: string): string => splitPath(path).name

/** Whether a file is drawn as a formatted document instead of as source. */
export const isMarkdown = (path: string): boolean => {
  const name = getFileName(path)
  const dot = name.lastIndexOf('.')

  return dot > 0 && FILES.markdown.includes(name.slice(dot + 1).toLowerCase())
}

/**
 * Whether a file can be edited from the phone: all of it must be here (not a binary, not only the
 * start of a large file) and small enough for a text box.
 */
export const isEditable = (file: FileContent): boolean =>
  !file.binary && !file.image && !file.truncated && file.content.length <= FILES.edit.maxChars

/**
 * What the toolbar says of the file. A save under way or failed comes first; then whether there
 * is something to save; then why it cannot be edited; and "Saved" only after a save from here.
 */
export const getFileStatus = (arg: {
  file: FileContent
  save: FileSave | undefined
  dirty: boolean
  online: boolean
}): FileStatus | null => {
  if (arg.save?.state === 'saving') return 'saving'
  if (arg.dirty) return arg.save?.state === 'failed' ? 'failed' : 'unsaved'
  if (arg.file.binary || arg.file.image) return null
  if (!isEditable(arg.file)) return 'large'
  if (!arg.online) return 'offline'

  return arg.save?.state === 'saved' ? 'saved' : null
}

/** A file's text as numbered lines. */
export const toLines = (content: string, colored: HighlightLine[] | null = null): CodeLine[] =>
  content.split('\n').map((text, index) => ({
    key: `l${index}`,
    number: index + 1,
    text,
    tokens: colored?.[index] ?? null,
  }))
