/**
 * What a phone is called when its system does not say: also what iOS 16 and later answer for
 * every phone and tablet without a special entitlement, which names nothing in particular.
 */
export const DEVICE = {
  generic: ['iPhone', 'iPad', 'iPod touch'],
  fallback: 'Phone',
} as const
