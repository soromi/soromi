import { expect, test } from 'vitest'

import { isBinaryDiff, parseDiff } from './diff'

const PATCH = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,3 @@ export const a',
  ' const keep = 1',
  '-const old = 2',
  '+const fresh = 2',
  '\\ No newline at end of file',
].join('\n')

test('a patch becomes its hunks: header, context, removals and additions', () => {
  expect(parseDiff(PATCH)).toEqual([
    { kind: 'hunk', text: '@@ -1,3 +1,3 @@ export const a' },
    { kind: 'ctx', text: 'const keep = 1' },
    { kind: 'del', text: 'const old = 2' },
    { kind: 'add', text: 'const fresh = 2' },
    { kind: 'ctx', text: '\\ No newline at end of file' },
  ])
})

test('the newline that ends a patch is not a row of its own', () => {
  expect(parseDiff('@@ -1 +1 @@\n-old\n+new\n')).toEqual([
    { kind: 'hunk', text: '@@ -1 +1 @@' },
    { kind: 'del', text: 'old' },
    { kind: 'add', text: 'new' },
  ])
  // A blank line inside a hunk is still one.
  expect(parseDiff('@@ -1,2 +1,2 @@\n \n-a\n').map((row) => row.kind)).toEqual([
    'hunk',
    'ctx',
    'del',
  ])
})

test('file headers are dropped, and a patch with no hunk has no rows', () => {
  expect(parseDiff('diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x')).toEqual([])
  expect(parseDiff('')).toEqual([])
})

test('a binary change is recognised, not parsed', () => {
  expect(isBinaryDiff('diff --git a/a.png b/a.png\nBinary files a/a.png and b/a.png differ')).toBe(
    true,
  )
  expect(isBinaryDiff(PATCH)).toBe(false)
})
