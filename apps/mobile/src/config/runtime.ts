import { getRandomValues } from 'expo-crypto'

// `@soromi/core` draws the randomness for a link's session keys from `crypto.getRandomValues`,
// which this runtime does not provide on its own. Back it with the platform's secure generator.
const scope = globalThis as { crypto?: { getRandomValues?: unknown } }
if (typeof scope.crypto?.getRandomValues !== 'function') {
  scope.crypto = { ...scope.crypto, getRandomValues }
}
