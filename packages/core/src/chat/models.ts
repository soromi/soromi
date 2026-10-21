//Types
import type { ProviderModels as WireProviderModels } from '@soromi/protocol'

/**
 * A model that can be picked. `value` is what the daemon launches with (`null` is the provider's
 * own default); `effort` marks a model that takes a reasoning-effort level; `contextLimit` is the
 * size of its context window.
 */
export interface ModelOption {
  value: string | null
  label: string
  description: string
  effort: boolean
  contextLimit: number
}

/** One provider's models, with its reasoning-effort ladder. */
export interface ProviderModels {
  models: ModelOption[]
  /** Effort levels, lowest first; empty if the provider has no reasoning-effort control. */
  effortLevels: string[]
  /** Display names for the effort levels (not every one title-cases cleanly). */
  effortLabels: Record<string, string>
  /** The effort the provider uses when none is set. */
  defaultEffort: string
}

/** Every provider's models, by provider. The daemon owns the list; no model name lives in an app. */
export type ModelCatalog = Record<string, ProviderModels>

/** The context window assumed for a provider that lists no models. */
const STANDARD_CONTEXT = 200_000

/**
 * The daemon's catalog in the shape the pickers use: a model with no `value` (the default) gets
 * `null`, so comparing with a session's model and sending it back both work without special cases.
 */
export function normalizeModelCatalog(
  wire: Record<string, WireProviderModels | undefined>,
): ModelCatalog {
  const catalog: ModelCatalog = {}
  for (const [provider, models] of Object.entries(wire)) {
    if (!models) continue
    const effortLabels: Record<string, string> = {}
    for (const [level, label] of Object.entries(models.effortLabels)) {
      if (label != null) effortLabels[level] = label
    }
    catalog[provider] = {
      models: models.models.map((model) => ({ ...model, value: model.value ?? null })),
      effortLevels: models.effortLevels,
      effortLabels,
      defaultEffort: models.defaultEffort,
    }
  }
  return catalog
}

/** A provider's models, or `null` if it lists none (there is then nothing to pick). */
export function modelsFor(catalog: ModelCatalog, agent: string | undefined): ProviderModels | null {
  const found = agent ? catalog[agent] : undefined
  return found && found.models.length > 0 ? found : null
}

/** The model a session runs: the one named, or the provider's first when it names none it lists. */
export function selectedModel(models: ProviderModels, model: string | null): ModelOption {
  return models.models.find((option) => option.value === model) ?? models.models[0]
}

/** An effort level's display name. */
export function effortLabel(models: ProviderModels, effort: string): string {
  return models.effortLabels[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1)
}

/** The effort a session runs at: the one set, or the provider's default. */
export function selectedEffort(models: ProviderModels, effort: string | null): string {
  return effort ?? models.defaultEffort
}

/** A session's model in a few words: "Default · High", or just "Haiku" for one without effort. */
export function modelSummary(
  models: ProviderModels,
  model: string | null,
  effort: string | null,
): string {
  const current = selectedModel(models, model)
  if (!current.effort) return current.label
  return `${current.label} · ${effortLabel(models, selectedEffort(models, effort))}`
}

/** The size of the context window a session's model has. */
export function contextLimit(
  catalog: ModelCatalog,
  agent: string | undefined,
  model: string | null,
): number {
  const models = modelsFor(catalog, agent)
  return models ? selectedModel(models, model).contextLimit : STANDARD_CONTEXT
}
