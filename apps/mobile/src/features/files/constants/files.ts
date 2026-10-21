//Type
import type { FilesConfig } from '../types'

export const FILES: FilesConfig = {
  icons: {
    code: 'code',
    doc: 'file-text',
    image: 'image',
    lock: 'lock',
    page: 'file',
  },
  iconSize: 18,
  chevronSize: 16,
  indent: 16,
  markdown: ['md', 'mdx', 'markdown'],
  menu: {
    absolute: 'Copy path',
    relative: 'Copy relative path',
  },
  modes: [
    { id: 'preview', label: 'Preview' },
    { id: 'raw', label: 'Raw' },
  ],
  edit: {
    maxChars: 200_000,
    timeoutMs: 8000,
    edit: 'Edit',
    save: 'Save',
    done: 'Done',
    discard: {
      title: 'Discard your changes?',
      message: 'What you changed in this file has not been saved.',
      keep: 'Keep editing',
      confirm: 'Discard',
    },
  },
  status: {
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    failed: 'Could not save',
    offline: 'Offline: read-only',
    large: 'Too large to edit here',
  },
  copy: {
    empty: 'No folders.',
    binary: 'Binary file. Not shown.',
    truncated: 'This is the start of a large file; the rest was left out.',
  },
}
