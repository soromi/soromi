import { z } from 'zod'

//
import { AccountProfileSchema } from './account'
import { StatusSchema } from './status'

/** How aggressively the daemon holds the machine awake. */
export const KeepAwakeModeSchema = z.enum(['off', 'working', 'always'])
export type KeepAwakeMode = z.infer<typeof KeepAwakeModeSchema>

/**
 * WebSocket envelope between a viewport and the daemon.
 *
 * These schemas are transport-agnostic on purpose: the same envelopes travel over
 * the local `localhost` socket today and, when the remote relay lands, are wrapped
 * as opaque E2EE blobs and tunneled unchanged. Nothing here needs to know whether
 * the peer is local or remote; that is the seam that keeps remote from forcing a
 * rewrite.
 */

// Client to daemon
export const AttachMessageSchema = z.object({
  type: z.literal('attach'),
  workspace: z.string(),
})
export const InputMessageSchema = z.object({
  type: z.literal('input'),
  workspace: z.string(),
  data: z.string(),
})
export const ResizeMessageSchema = z.object({
  type: z.literal('resize'),
  workspace: z.string(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
})
export const ListWorkspacesMessageSchema = z.object({
  type: z.literal('list-workspaces'),
})
export const OpenWorkspaceMessageSchema = z.object({
  type: z.literal('open-workspace'),
  dir: z.string().min(1),
})
export const CreateSpaceMessageSchema = z.object({
  type: z.literal('create-space'),
  name: z.string().min(1),
  root: z.string().min(1),
  agent: z.string().min(1),
  account: z.string().min(1),
  folders: z.array(z.string()).optional(),
})
export const RemoveSpaceMessageSchema = z.object({
  type: z.literal('remove-space'),
  workspace: z.string(),
})
export const MuteWorkspaceMessageSchema = z.object({
  type: z.literal('mute-workspace'),
  workspace: z.string(),
  muted: z.boolean(),
})
export const ListDirMessageSchema = z.object({
  type: z.literal('list-dir'),
  workspace: z.string(),
  /** Relative to the workspace root; empty lists the workspace's folders. */
  path: z.string(),
})
export const ReadFileMessageSchema = z.object({
  type: z.literal('read-file'),
  workspace: z.string(),
  path: z.string(),
})
export const ListAccountsMessageSchema = z.object({
  type: z.literal('list-accounts'),
})
export const SaveAccountMessageSchema = z.object({
  type: z.literal('save-account'),
  profile: AccountProfileSchema,
})
export const DeleteAccountMessageSchema = z.object({
  type: z.literal('delete-account'),
  name: z.string().min(1),
})
export const SetKeepAwakeModeMessageSchema = z.object({
  type: z.literal('set-keep-awake-mode'),
  mode: KeepAwakeModeSchema,
})

export const ClientMessageSchema = z.discriminatedUnion('type', [
  AttachMessageSchema,
  InputMessageSchema,
  ResizeMessageSchema,
  ListWorkspacesMessageSchema,
  OpenWorkspaceMessageSchema,
  CreateSpaceMessageSchema,
  RemoveSpaceMessageSchema,
  MuteWorkspaceMessageSchema,
  ListDirMessageSchema,
  ReadFileMessageSchema,
  ListAccountsMessageSchema,
  SaveAccountMessageSchema,
  DeleteAccountMessageSchema,
  SetKeepAwakeModeMessageSchema,
])
export type ClientMessage = z.infer<typeof ClientMessageSchema>

// Daemon to client
export const OutputMessageSchema = z.object({
  type: z.literal('output'),
  workspace: z.string(),
  data: z.string(),
})
export const StatusMessageSchema = z.object({
  type: z.literal('status'),
  workspace: z.string(),
  status: StatusSchema,
})
export const NotifyMessageSchema = z.object({
  type: z.literal('notify'),
  workspace: z.string(),
  status: StatusSchema,
  message: z.string(),
})
export const WorkspaceSummarySchema = z.object({
  name: z.string(),
  status: StatusSchema,
  agent: z.string(),
  account: z.string(),
  folders: z.array(z.string()),
})
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>

export const WorkspaceListMessageSchema = z.object({
  type: z.literal('workspace-list'),
  workspaces: z.array(WorkspaceSummarySchema),
})
export const WorkspaceOpenedMessageSchema = z.object({
  type: z.literal('workspace-opened'),
  workspace: z.string(),
  warning: z.string().optional(),
})
export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
})

export const DirEntrySchema = z.object({
  name: z.string(),
  type: z.enum(['file', 'dir']),
})
export type DirEntry = z.infer<typeof DirEntrySchema>

export const DirListingMessageSchema = z.object({
  type: z.literal('dir-listing'),
  workspace: z.string(),
  path: z.string(),
  entries: z.array(DirEntrySchema),
})
export const FileContentMessageSchema = z.object({
  type: z.literal('file-content'),
  workspace: z.string(),
  path: z.string(),
  content: z.string(),
  truncated: z.boolean(),
  binary: z.boolean(),
})
export const KeepAwakeMessageSchema = z.object({
  type: z.literal('keep-awake'),
  active: z.boolean(),
  mode: KeepAwakeModeSchema,
})
export const AccountListMessageSchema = z.object({
  type: z.literal('account-list'),
  accounts: z.array(AccountProfileSchema),
})

export const ServerMessageSchema = z.discriminatedUnion('type', [
  OutputMessageSchema,
  StatusMessageSchema,
  NotifyMessageSchema,
  WorkspaceListMessageSchema,
  WorkspaceOpenedMessageSchema,
  ErrorMessageSchema,
  DirListingMessageSchema,
  FileContentMessageSchema,
  KeepAwakeMessageSchema,
  AccountListMessageSchema,
])
export type ServerMessage = z.infer<typeof ServerMessageSchema>
