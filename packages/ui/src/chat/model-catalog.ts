// The selectable models per provider. The list is **provided by the daemon** (each provider owns its
// own model names, ids, effort ladder, and context windows) and delivered on connect via the
// `model-catalog` message; the app populates it with `setModelCatalog`. The composer's model picker
// and the "context filling up" banner read it by the session's agent — no provider names live here.

/** A selectable model. `value` is the launch alias the daemon passes (null = the provider default);
 * `effort` marks models that accept a reasoning-effort level; `contextLimit` sizes the context meter. */
export interface ModelOption {
  value: string | null
  label: string
  description: string
  effort: boolean
  contextLimit: number
}

/** One provider's model picker data: its models plus its reasoning-effort ladder. */
export interface ProviderModels {
  models: ModelOption[]
  /** Effort levels low → highest; empty if the provider has no reasoning-effort control. */
  effortLevels: string[]
  /** Display names for the effort tokens (the wire tokens don't always title-case cleanly). */
  effortLabels: Record<string, string>
  /** The effort the provider uses when none is set explicitly. */
  defaultEffort: string
}

const STANDARD = 200_000

/** The wire shape of a catalog (from `@soromi/protocol`): `value` may be absent for the default,
 * and `effortLabels` values are optional. `setModelCatalog` normalizes it into `ProviderModels`. */
interface WireProviderModels {
  models: Array<{
    value?: string | null
    label: string
    description: string
    effort: boolean
    contextLimit: number
  }>
  effortLevels: string[]
  effortLabels: Record<string, string | undefined>
  defaultEffort: string
}

/** The daemon-provided catalogs, keyed by provider. Empty until the `model-catalog` message lands. */
let catalog: Record<string, ProviderModels> = {}

/** Ingest the per-provider catalogs from the daemon, normalizing the wire shape (absent `value` →
 * `null`, so the picker's `value === model` matching and the daemon's "default" round-trip cleanly). */
export function setModelCatalog(next: Record<string, WireProviderModels | undefined>): void {
  const normalized: Record<string, ProviderModels> = {}
  for (const [provider, pm] of Object.entries(next)) {
    if (!pm) continue
    normalized[provider] = {
      models: pm.models.map((m) => ({ ...m, value: m.value ?? null })),
      effortLevels: pm.effortLevels,
      effortLabels: Object.fromEntries(
        Object.entries(pm.effortLabels).filter(([, v]) => v != null),
      ) as Record<string, string>,
      defaultEffort: pm.defaultEffort,
    }
  }
  catalog = normalized
}

/** The model-picker data for a provider, or `null` if it exposes no models (hides the picker). */
export function modelCatalog(agent: string | undefined): ProviderModels | null {
  return (agent && catalog[agent]) || null
}

/** The context-window size for a session's model, for the "context filling up" banner. */
export function contextLimitFor(agent: string | undefined, model: string | null): number {
  const found = modelCatalog(agent)
  if (!found) return STANDARD
  const option = found.models.find((m) => m.value === model) ?? found.models[0]
  return option?.contextLimit ?? STANDARD
}
