//Utils
import { cn } from '../lib/utils'

//Types
import type { SlashCommand } from '@soromi/protocol'

/**
 * The `/` command menu shown above the chat composer while the user is typing a slash command. Purely
 * presentational: the Composer owns filtering, the selected index, and keyboard navigation.
 */
export function SlashMenu({
  commands,
  selected,
  onSelect,
  onHover,
}: {
  commands: SlashCommand[]
  selected: number
  onSelect: (command: SlashCommand) => void
  onHover: (index: number) => void
}) {
  return (
    <div className="absolute right-0 bottom-full left-0 z-[var(--z-popover)] mb-2 max-h-[280px] overflow-y-auto rounded-[12px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-terminal)] py-1.5 shadow-[0_12px_40px_rgb(0_0_0/45%)]">
      {commands.map((command, index) => (
        <button
          key={command.name}
          type="button"
          // Mousedown (not click) + preventDefault keeps the textarea focused through the selection.
          onMouseDown={(event) => {
            event.preventDefault()
            onSelect(command)
          }}
          onMouseEnter={() => onHover(index)}
          className={cn(
            'flex w-full items-baseline gap-4 border-none bg-transparent px-4 py-[7px] text-left',
            index === selected && 'bg-[var(--soromi-bg-hover)]',
          )}
        >
          <span className="w-[132px] flex-none truncate font-medium text-[14px] text-[var(--soromi-accent)] [font-family:var(--soromi-font-mono)]">
            /{command.name}
          </span>
          {command.description && (
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--soromi-text-faint)]">
              {command.description}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
