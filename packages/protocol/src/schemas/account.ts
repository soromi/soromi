import { z } from 'zod'

/**
 * One provider's isolation config within an account profile: the env vars and/or
 * config directory that give this account its own logged-in session.
 */
export const ProviderConfigSchema = z.object({
  env: z.record(z.string(), z.string()).optional(),
  configDir: z.string().optional(),
})

/**
 * A named account profile stored under `~/.soromi/accounts/<name>/`. Workspaces
 * reference it by name; secrets never enter the committable `workspace.json`.
 */
export const AccountProfileSchema = z.object({
  name: z.string().min(1),
  providers: z.record(z.string(), ProviderConfigSchema),
})

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>
export type AccountProfile = z.infer<typeof AccountProfileSchema>
