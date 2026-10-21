//Types
import type { SlashCommand } from '@soromi/protocol'

/**
 * What has been typed of a slash command: the text after a leading `/` with no space yet ("re"
 * for "/re"), or `null` when the message is not a bare slash command.
 */
export function slashQuery(value: string): string | null {
  const match = /^\/(\S*)$/.exec(value)
  return match ? match[1] : null
}

/** The commands a message being typed could turn into; none once it is more than a bare command. */
export function matchCommands(commands: SlashCommand[], value: string): SlashCommand[] {
  const query = slashQuery(value)
  if (query === null) return []
  const typed = query.toLowerCase()
  return commands.filter((command) => command.name.toLowerCase().startsWith(typed))
}

/** A command as it is written into the message box: with a space after it, ready for arguments. */
export function commandText(command: SlashCommand): string {
  return `/${command.name} `
}
