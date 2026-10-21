// The selectable models per provider. The list is **provided by the daemon** (each provider owns its
// own model names, ids, effort ladder, and context windows) and delivered on connect via the
// `model-catalog` message; the app populates it with `setModelCatalog`. The composer's model picker
// and the "context filling up" banner read it by the session's agent — no provider names live here.
// The shapes and lookups are `@soromi/core`'s, shared with the mobile app.
import { contextLimit, modelsFor, normalizeModelCatalog } from '@soromi/core'

//Types
import type { ModelCatalog, ModelOption, ProviderModels } from '@soromi/core'

export type { ModelOption, ProviderModels }

/** The daemon-provided catalogs, keyed by provider. Empty until the `model-catalog` message lands. */
let catalog: ModelCatalog = {}

/** Ingest the per-provider catalogs from the daemon, normalizing the wire shape (absent `value` →
 * `null`, so the picker's `value === model` matching and the daemon's "default" round-trip cleanly). */
export function setModelCatalog(next: Parameters<typeof normalizeModelCatalog>[0]): void {
  catalog = normalizeModelCatalog(next)
}

/** The model-picker data for a provider, or `null` if it exposes no models (hides the picker). */
export function modelCatalog(agent: string | undefined): ProviderModels | null {
  return modelsFor(catalog, agent)
}

/** The context-window size for a session's model, for the "context filling up" banner. */
export function contextLimitFor(agent: string | undefined, model: string | null): number {
  return contextLimit(catalog, agent, model)
}
