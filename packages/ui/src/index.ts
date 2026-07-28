// Shared, presentational feature components used by both the desktop app and the web app. They
// take data and callbacks via props (and refs for imperative calls), so all store / transport /
// platform logic stays in each app's own containers.

export { SkillList } from './skills/skill-list'
export type { SkillListProps } from './skills/skill-list'

export { FileTree } from './files/file-tree'
export type { FileNode, FileTreeProps } from './files/file-tree'

export { flattenTree } from './files/flatten'
export type { TreeState } from './files/flatten'

export { SessionTabs } from './sessions/session-tabs'
export type { SessionTab, SessionTabsProps } from './sessions/session-tabs'

export { ProviderIcon } from './icons/provider-icon'

export { useReorder } from './hooks/use-reorder'
export { DragHandle } from './drag-handle'

export { cn } from './lib/utils'

// shadcn/ui primitives (Tailwind + Radix), shared by the desktop and web apps.
export { Button, buttonVariants } from './components/ui/button'
export type { ButtonProps } from './components/ui/button'
export { Input } from './components/ui/input'
export { Textarea } from './components/ui/textarea'
export { Label } from './components/ui/label'
export { Switch } from './components/ui/switch'
export { Spinner } from './components/ui/spinner'
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select'
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog'
export { ConfirmDialog } from './components/ui/alert-dialog'
export { Sheet, SheetClose, SheetContent, SheetTrigger } from './components/ui/sheet'

export { useMediaQuery } from './hooks/use-media-query'

export { UsageWidget } from './usage/usage-widget'
export type { UsageWidgetProps } from './usage/usage-widget'
