import { z } from 'zod'
import { StatusSchema } from './status'

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

export const ClientMessageSchema = z.discriminatedUnion('type', [
  AttachMessageSchema,
  InputMessageSchema,
  ResizeMessageSchema,
  ListWorkspacesMessageSchema,
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
export const WorkspaceListMessageSchema = z.object({
  type: z.literal('workspace-list'),
  workspaces: z.array(z.object({ name: z.string(), status: StatusSchema })),
})

export const ServerMessageSchema = z.discriminatedUnion('type', [
  OutputMessageSchema,
  StatusMessageSchema,
  NotifyMessageSchema,
  WorkspaceListMessageSchema,
])
export type ServerMessage = z.infer<typeof ServerMessageSchema>
