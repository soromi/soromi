//Type
import type { PanelConfig } from '../types'

export const PANEL: PanelConfig = {
  views: [
    { id: 'files', label: 'Files', icon: 'folder' },
    { id: 'skills', label: 'Skills', icon: 'sparkles' },
    { id: 'git', label: 'Git', icon: 'git' },
    { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  ],
  initial: 'files',
  close: 'Close the panel',
}
