import { describe, expect, it } from 'vitest'

import { contextPercent, isContextFilling } from './context'
import { commandText, matchCommands, slashQuery } from './slash'

const commands = [{ name: 'compact' }, { name: 'clear' }, { name: 'review', description: 'Review' }]

describe('slash commands', () => {
  it('are being typed only while the message is a bare command', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/re')).toBe('re')
    expect(slashQuery('/review the diff')).toBeNull()
    expect(slashQuery('say /re')).toBeNull()
    expect(slashQuery('')).toBeNull()
  })

  it('are offered by what has been typed of them, whatever its case', () => {
    expect(matchCommands(commands, '/').map((command) => command.name)).toEqual([
      'compact',
      'clear',
      'review',
    ])
    expect(matchCommands(commands, '/C').map((command) => command.name)).toEqual([
      'compact',
      'clear',
    ])
    expect(matchCommands(commands, '/x')).toEqual([])
    expect(matchCommands(commands, '/clear now')).toEqual([])
    expect(matchCommands(commands, 'hello')).toEqual([])
  })

  it('are written with room for what follows', () => {
    expect(commandText({ name: 'review' })).toBe('/review ')
  })
})

describe('context', () => {
  it('is measured against the model’s window', () => {
    expect(contextPercent(100_000, 200_000)).toBe(50)
    expect(contextPercent(900_000, 200_000)).toBe(100)
    expect(contextPercent(1, 0)).toBe(0)
  })

  it('is said to be filling from four fifths up', () => {
    expect(isContextFilling(158_000, 200_000)).toBe(false)
    expect(isContextFilling(160_000, 200_000)).toBe(true)
    expect(isContextFilling(null, 200_000)).toBe(false)
  })
})
