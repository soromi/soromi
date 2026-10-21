//Type
import type { FolderChoice } from './types'

/**
 * Where a new terminal can start: the top of the workspace, then each of its folders by its own
 * name. A workspace that is one whole folder lists that folder as `.`, which is the top again.
 */
export const getFolderChoices = (folders: string[] | undefined, root: string): FolderChoice[] => [
  { folder: '', label: root },
  ...(folders ?? [])
    .filter((folder) => folder !== '.' && folder !== '')
    .map((folder) => ({ folder, label: folder.split('/').filter(Boolean).pop() ?? folder })),
]
