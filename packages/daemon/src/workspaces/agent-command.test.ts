import { describe, expect, it } from 'vitest'

//
import { parseAgentCommand } from './agent-command'

describe('parseAgentCommand', () => {
  it('parses a bare command', () => {
    expect(parseAgentCommand('claude')).toEqual({ command: 'claude', args: [] })
  })

  it('splits arguments on whitespace', () => {
    expect(parseAgentCommand('claude --resume main')).toEqual({
      command: 'claude',
      args: ['--resume', 'main'],
    })
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(parseAgentCommand('  claude   --x  ')).toEqual({ command: 'claude', args: ['--x'] })
  })

  it('throws on an empty command', () => {
    expect(() => parseAgentCommand('   ')).toThrow()
  })
})
