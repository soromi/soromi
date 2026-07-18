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

export { theme } from './mantine-theme'

export { UsageWidget } from './usage/usage-widget'
export type { UsageWidgetProps } from './usage/usage-widget'
