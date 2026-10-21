import { effortLabel as labelFor, selectedEffort, selectedModel } from '@soromi/core'
import { Check, ChevronDown, Sparkles } from 'lucide-react'

//Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { modelCatalog } from './model-catalog'
import { cn } from '../lib/utils'

/**
 * The composer's model picker: pick the session's model, and — for models that support it — the
 * reasoning effort. Applied live (the daemon translates the choice per provider) and persisted. The
 * models, effort ladder, and labels all come from the provider's catalog (`modelCatalog(agent)`), so
 * this component holds no provider names; it renders nothing for a provider with no catalog.
 */
export function ModelSelect({
  agent,
  model,
  effort,
  onChange,
}: {
  agent?: string
  model: string | null
  effort: string | null
  onChange: (model: string | null, effort: string | null) => void
}) {
  const catalog = modelCatalog(agent)
  if (!catalog) return null
  const { models, effortLevels } = catalog
  const effortLabel = (level: string) => labelFor(catalog, level)
  const current = selectedModel(catalog, model)
  const activeEffort = selectedEffort(catalog, effort)

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
          {current.effort && <span className="opacity-70">· {effortLabel(activeEffort)}</span>}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {models.map((option) => (
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
            <span className="text-[11px] text-[var(--soromi-text-faint)]">
              {option.description}
            </span>
          </DropdownMenuItem>
        ))}

        {current.effort && (
          <>
            <DropdownMenuSeparator />
            {/* Plain buttons (not menu items) so tweaking effort doesn't close the menu. The label
                sits above the row so all five levels fit without crowding the model descriptions. */}
            <div className="px-2 py-1.5">
              <span className="text-[11px] text-[var(--soromi-text-faint)]">Effort</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {effortLevels.map((level) => (
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
                    {effortLabel(level)}
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
