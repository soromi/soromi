export interface AgentCommand {
  command: string
  args: string[]
}

/**
 * Splits a workspace `agent` field into a command and its arguments on whitespace.
 * No shell parsing: quotes and globs are not interpreted.
 */
export function parseAgentCommand(agent: string): AgentCommand {
  const [command, ...args] = agent.trim().split(/\s+/)
  if (!command) throw new Error('workspace agent command is empty')
  return { command, args }
}
