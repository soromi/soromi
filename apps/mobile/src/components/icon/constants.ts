import ArrowUp from 'lucide-react-native/icons/arrow-up'
import Bot from 'lucide-react-native/icons/bot'
import Brain from 'lucide-react-native/icons/brain'
import Camera from 'lucide-react-native/icons/camera'
import ChartLine from 'lucide-react-native/icons/chart-line'
import Check from 'lucide-react-native/icons/check'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import ChevronUp from 'lucide-react-native/icons/chevron-up'
import Clock from 'lucide-react-native/icons/clock'
import ClipboardList from 'lucide-react-native/icons/clipboard-list'
import Cloud from 'lucide-react-native/icons/cloud'
import Code from 'lucide-react-native/icons/code'
import ExternalLink from 'lucide-react-native/icons/external-link'
import File from 'lucide-react-native/icons/file'
import FileText from 'lucide-react-native/icons/file-text'
import Folder from 'lucide-react-native/icons/folder'
import GitBranch from 'lucide-react-native/icons/git-branch'
import Image from 'lucide-react-native/icons/image'
import LayoutGrid from 'lucide-react-native/icons/layout-grid'
import List from 'lucide-react-native/icons/list'
import ListPlus from 'lucide-react-native/icons/list-plus'
import Lock from 'lucide-react-native/icons/lock'
import QrCode from 'lucide-react-native/icons/qr-code'
import Ellipsis from 'lucide-react-native/icons/ellipsis'
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
import Trash from 'lucide-react-native/icons/trash'
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
  camera: Camera,
  chart: ChartLine,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  clipboard: ClipboardList,
  clock: Clock,
  close: X,
  cloud: Cloud,
  code: Code,
  external: ExternalLink,
  file: File,
  'file-text': FileText,
  folder: Folder,
  git: GitBranch,
  grid: LayoutGrid,
  image: Image,
  list: List,
  'list-plus': ListPlus,
  lock: Lock,
  more: Ellipsis,
  panel: PanelRight,
  paperclip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  qr: QrCode,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  sparkles: Sparkles,
  stop: Square,
  terminal: SquareTerminal,
  trash: Trash,
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
