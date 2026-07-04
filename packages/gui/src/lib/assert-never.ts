/** Compile-time exhaustiveness guard; throws if somehow reached at runtime. */
export function assertNever(value: never): never {
  throw new Error(`unexpected value: ${JSON.stringify(value)}`)
}
