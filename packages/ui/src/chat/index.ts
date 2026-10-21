// The transcript "chat" renderer: AI Elements-style, own-your-state presentational components for an
// agent's parsed transcript (prose, reasoning, tool calls). A subpath export (like `code-viewer`) so
// `streamdown` + `shiki` stay out of the main bundle and load only where the chat view is used.

export { AgentLogView } from './agent-log'
export type { AgentLogViewProps } from './agent-log'
export { AgentSelect } from './agent-select'
export type { AgentOption } from './agent-select'
export { contextLimitFor, setModelCatalog } from './model-catalog'
export { ChatView } from './chat-view'
export type { ChatViewProps } from './chat-view'
export { Markdown } from './markdown'
export type { MarkdownProps } from './markdown'
export { Reasoning } from './reasoning'
export type { ReasoningProps } from './reasoning'
export { ToolCall } from './tool-call'
export type { ToolCallProps, ToolResult } from './tool-call'
