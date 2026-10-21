import ArrowUp from 'lucide-react-native/icons/arrow-up'
import Bot from 'lucide-react-native/icons/bot'
import Brain from 'lucide-react-native/icons/brain'
import Check from 'lucide-react-native/icons/check'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import ChevronUp from 'lucide-react-native/icons/chevron-up'
import ClipboardList from 'lucide-react-native/icons/clipboard-list'
import Cloud from 'lucide-react-native/icons/cloud'
import Code from 'lucide-react-native/icons/code'
import File from 'lucide-react-native/icons/file'
import FileText from 'lucide-react-native/icons/file-text'
import Folder from 'lucide-react-native/icons/folder'
import GitBranch from 'lucide-react-native/icons/git-branch'
import Image from 'lucide-react-native/icons/image'
import LayoutGrid from 'lucide-react-native/icons/layout-grid'
import List from 'lucide-react-native/icons/list'
import Lock from 'lucide-react-native/icons/lock'
import PanelRight from 'lucide-react-native/icons/panel-right'
import Paperclip from 'lucide-react-native/icons/paperclip'
import Pencil from 'lucide-react-native/icons/pencil'
import Plus from 'lucide-react-native/icons/plus'
import RefreshCw from 'lucide-react-native/icons/refresh-cw'
import Search from 'lucide-react-native/icons/search'
import Settings from 'lucide-react-native/icons/settings'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import Sparkles from 'lucide-react-native/icons/sparkles'
import Square from 'lucide-react-native/icons/square'
import SquarePen from 'lucide-react-native/icons/square-pen'
import SquareTerminal from 'lucide-react-native/icons/square-terminal'
import Wifi from 'lucide-react-native/icons/wifi'
import Wrench from 'lucide-react-native/icons/wrench'
import X from 'lucide-react-native/icons/x'

//Type
import type { IconName } from './types'

/**
 * Each icon, imported on its own: the library's main entry would put its whole set in the bundle.
 * The same set the desktop draws from, so the two apps show the same marks.
 */
export const ICONS: Record<IconName, typeof ArrowUp> = {
  'arrow-up': ArrowUp,
  bot: Bot,
  brain: Brain,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  clipboard: ClipboardList,
  close: X,
  cloud: Cloud,
  code: Code,
  file: File,
  'file-text': FileText,
  folder: Folder,
  git: GitBranch,
  grid: LayoutGrid,
  image: Image,
  list: List,
  lock: Lock,
  panel: PanelRight,
  paperclip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  sparkles: Sparkles,
  stop: Square,
  terminal: SquareTerminal,
  wifi: Wifi,
  wrench: Wrench,
  write: SquarePen,
}

export const ICON = {
  /** How heavy the lines are drawn. */
  strokeWidth: 2,
  /** What an icon that is only outlined is filled with. */
  hollow: 'none',
} as const
