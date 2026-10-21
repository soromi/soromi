/** A banner the computer asked for: a task finished, or an agent is waiting for an answer. */
export type Banner = {
  title: string
  body: string
  /** The session it is about, when the computer knows: where a tap on it leads. */
  session?: string
}

/** What a tapped banner was about. */
export type BannerTarget = {
  session: string
}

export type NotificationsConfig = {
  /** Android posts every banner on a channel, which is what its settings let a person silence. */
  channel: { id: string; name: string }
  /** Every banner that is not about a session shares this one, so the newest replaces the last. */
  general: string
}
