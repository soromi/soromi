export const ANSWERS = {
  /** How long an answer has to reach the computer: within what iOS gives the app to send it. */
  timeoutMs: 20_000,
  /** In place of the banner, when the answer could not be sent. A tap opens the session. */
  failed: {
    title: 'Your answer was not sent',
    body: 'Your computer could not be reached. Open the session to answer there.',
  },
} as const
