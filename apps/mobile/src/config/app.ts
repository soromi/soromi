/**
 * App-wide settings, read once. Anything from the environment (`process.env.EXPO_PUBLIC_*`) is
 * read here, as a literal access, and nowhere else.
 */
export const appConfig = {
  pairing: {
    /** How a pairing code starts. The app is also opened by links that start this way. */
    prefix: 'soromi://pair#',
  },
} as const
