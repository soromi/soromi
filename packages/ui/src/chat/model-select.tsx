import { Check, ChevronDown, Sparkles } from 'lucide-react'

//Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { cn } from '../lib/utils'

/** A selectable model. `value` is the `--model` alias the daemon passes (null = the provider
 * default); `effort` marks models that accept a reasoning-effort level. */
interface ModelOption {
  value: string | null
  label: string
  description: string
  effort: boolean
}

const MODELS: ModelOption[] = [
  {
    value: null,
    label: 'Default',
    description: 'Opus 5 with 1M context · best for everyday, complex tasks',
    effort: true,
  },
  {
    value: 'opus',
    label: 'Opus',
    description: 'Opus 5 with 1M context · best for everyday, complex tasks',
    effort: true,
  },
  {
    value: 'fable',
    label: 'Fable',
    description: 'Fable 5 · most capable for your hardest, longest-running tasks',
    effort: true,
  },
  {
    value: 'sonnet',
    label: 'Sonnet',
    description: 'Sonnet 5 · efficient for routine tasks',
    effort: false,
  },
  {
    value: 'haiku',
    label: 'Haiku',
    description: 'Haiku 4.5 · fastest for quick answers',
    effort: false,
  },
]

const EFFORT_LEVELS = ['low', 'medium', 'high'] as const
/** The level the CLI uses when none is set explicitly. */
const DEFAULT_EFFORT = 'high'
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The composer's model picker: pick the Claude model, and — for models that support it — the reasoning
 * effort. Applied live (the daemon sends `/model` / `/effort`) and persisted. Claude only, for now.
 */
export function ModelSelect({
  model,
  effort,
  onChange,
}: {
  model: string | null
  effort: string | null
  onChange: (model: string | null, effort: string | null) => void
}) {
  const current = MODELS.find((m) => m.value === model) ?? MODELS[0]
  const activeEffort = effort ?? DEFAULT_EFFORT

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Model"
          className="flex cursor-pointer appearance-none items-center gap-1 rounded-lg border-none bg-transparent px-2 py-1 font-medium text-[12px] text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {current.label}
          {current.effort && <span className="opacity-70">· {title(activeEffort)}</span>}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {MODELS.map((option) => (
          <DropdownMenuItem
            key={option.label}
            // Keep the current effort for effort-capable models; clear it otherwise.
            onClick={() => onChange(option.value, option.effort ? effort : null)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="flex items-center gap-1.5 text-[13px]">
              {option.label}
              {option.value === current.value && (
                <Check className="h-3 w-3 text-[var(--soromi-accent)]" />
              )}
            </span>
            <span className="text-[11px] text-[var(--soromi-text-faint)]">{option.description}</span>
          </DropdownMenuItem>
        ))}

        {current.effort && (
          <>
            <DropdownMenuSeparator />
            {/* Plain buttons (not menu items) so tweaking effort doesn't close the menu. */}
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[11px] text-[var(--soromi-text-faint)]">Effort</span>
              <div className="flex gap-1">
                {EFFORT_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => onChange(current.value, level)}
                    className={cn(
                      'cursor-pointer appearance-none rounded-md border-none px-2 py-0.5 text-[11px]',
                      activeEffort === level
                        ? 'bg-[var(--soromi-accent-dim)] text-[var(--soromi-accent)]'
                        : 'bg-transparent text-[var(--soromi-text-faint)] hover:bg-[var(--soromi-bg-hover)]',
                    )}
                  >
                    {title(level)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
