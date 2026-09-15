// The selectable models per provider. Today only Claude has a catalog; another provider adds its
// models, effort ladder, and context windows here in one place, and the composer's model picker +
// the "context filling up" banner pick it up by the session's agent — no provider names elsewhere.

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

const MILLION = 1_000_000
const STANDARD = 200_000

const CLAUDE: ProviderModels = {
  models: [
    {
      value: null,
      label: 'Default',
      description: 'Opus 5 with 1M context · best for everyday, complex tasks',
      effort: true,
      contextLimit: MILLION,
    },
    {
      value: 'opus',
      label: 'Opus',
      description: 'Opus 5 with 1M context · best for everyday, complex tasks',
      effort: true,
      contextLimit: MILLION,
    },
    {
      value: 'claude-opus-4-8[1m]',
      label: 'Opus 4.8',
      description: 'Opus 4.8 with 1M context · the prior Opus generation',
      effort: true,
      contextLimit: MILLION,
    },
    {
      value: 'fable',
      label: 'Fable',
      description: 'Fable 5 · most capable for your hardest, longest-running tasks',
      effort: true,
      contextLimit: STANDARD,
    },
    {
      value: 'sonnet',
      label: 'Sonnet',
      description: 'Sonnet 5 · efficient for routine tasks',
      effort: false,
      contextLimit: STANDARD,
    },
    {
      value: 'haiku',
      label: 'Haiku',
      description: 'Haiku 4.5 · fastest for quick answers',
      effort: false,
      contextLimit: STANDARD,
    },
  ],
  effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  effortLabels: { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'X-High', max: 'Max' },
  defaultEffort: 'high',
}

const CATALOG: Record<string, ProviderModels> = { claude: CLAUDE }

/** The model-picker data for a provider, or `null` if it exposes no models (hides the picker). */
export function modelCatalog(agent: string | undefined): ProviderModels | null {
  return (agent && CATALOG[agent]) || null
}

/** The context-window size for a session's model, for the "context filling up" banner. */
export function contextLimitFor(agent: string | undefined, model: string | null): number {
  const catalog = modelCatalog(agent)
  if (!catalog) return STANDARD
  const option = catalog.models.find((m) => m.value === model) ?? catalog.models[0]
  return option?.contextLimit ?? STANDARD
}
