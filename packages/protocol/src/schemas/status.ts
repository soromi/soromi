import { z } from 'zod'

/** Agent lifecycle status, surfaced as a badge on the workspace rail icon. */
export const StatusSchema = z.enum(['thinking', 'done', 'blocked', 'waiting-input', 'idle'])

export type Status = z.infer<typeof StatusSchema>
