import { expect, test } from 'vitest'

import { call, parseMessage } from './helpers'

test('a call to the page carries its arguments intact, whatever is in them', () => {
  expect(call('size', 80, 24)).toBe('window.__terminal&&window.__terminal.size(80,24);true;')
  // Output is escape sequences, quotes and line breaks; none of it may end the script early.
  const script = call('write', '\u001b[31m"red"\n</script>')
  expect(script).toContain('write("\\u001b[31m\\"red\\"\\n</script>")')
})

test('only the page’s own messages are read', () => {
  expect(parseMessage('{"type":"ready"}')).toEqual({ type: 'ready' })
  expect(parseMessage('{"type":"input","data":"ls\\r"}')).toEqual({ type: 'input', data: 'ls\r' })
  expect(parseMessage('{"type":"size","cols":80,"rows":24}')).toEqual({
    type: 'size',
    cols: 80,
    rows: 24,
  })
  expect(parseMessage('{"type":"size","cols":"80"}')).toBeNull()
  expect(parseMessage('{"type":"other"}')).toBeNull()
  expect(parseMessage('not json')).toBeNull()
})
