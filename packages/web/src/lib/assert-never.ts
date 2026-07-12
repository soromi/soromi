/** Exhaustiveness guard: a `default` calling this makes adding an overlay a compile error. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}
