import { z } from 'zod'

/**
 * A folder path is always relative to the workspace root and must not escape it.
 * `soromi.space.json` is committable, so absolute paths (which leak machine layout)
 * and parent traversal are rejected outright.
 */
const FolderPathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/'), { message: 'folder path must be relative, not absolute' })
  .refine((p) => !/^[a-zA-Z]:[\\/]/.test(p), {
    message: 'folder path must be relative, not absolute',
  })
  .refine((p) => !p.split(/[\\/]/).includes('..'), {
    message: 'folder path must not escape the workspace root',
  })

/** Optional per-workspace defaults; the top-level fields win when both are set. */
export const WorkspaceDefaultsSchema = z.object({
  agent: z.string().min(1).optional(),
  account: z.string().min(1).optional(),
})

/**
 * The committable descriptor at the root of a work folder. References the account
 * profile by name only; zero secrets live here.
 */
export const WorkspaceSchema = z.object({
  name: z.string().min(1),
  folders: z.array(FolderPathSchema).min(1),
  agent: z.string().min(1),
  account: z.string().min(1),
  defaults: WorkspaceDefaultsSchema.optional(),
})

export type WorkspaceDefaults = z.infer<typeof WorkspaceDefaultsSchema>
export type Workspace = z.infer<typeof WorkspaceSchema>
