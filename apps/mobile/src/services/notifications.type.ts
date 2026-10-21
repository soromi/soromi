/** A banner the computer asked for: a task finished, or an agent is waiting for an answer. */
export type Banner = {
  title: string
  body: string
  /** The session it is about, when the computer knows: where a tap on it leads. */
  session?: string
  /** The tool request it is about, which its Allow and Deny buttons answer. */
  approval?: string
}

/** What one of a banner's buttons answers a tool request with. */
export type BannerAnswer = 'allow' | 'deny'

/** What a tapped banner was about. */
export type BannerTarget = {
  session: string
  /** This phone's id on the computer that pushed it; absent for one posted from the link. */
  device?: string
  /** The tool request it is about, when it is about one. */
  approval?: string
  /** The button it was answered with, when it was not just tapped. */
  answer?: BannerAnswer
  /** The banner's own name on the phone, to take it down once it is answered. */
  banner?: string
}

/** A tool request answered from one of its banner's buttons. */
export type BannerAnswered = BannerTarget & { approval: string; answer: BannerAnswer }

export type NotificationsConfig = {
  /** Android posts every banner on a channel, which is what its settings let a person silence. */
  channel: { id: string; name: string }
  /** Every banner that is not about a session shares this one, so the newest replaces the last. */
  general: string
  /**
   * What Android runs when one of those buttons is pressed with the app behind another or closed:
   * a task of the app's, with no screen.
   */
  task: string
  /** The kind of banner a tool request is posted as, with its two buttons. */
  approval: {
    category: string
    allow: { id: BannerAnswer; title: string }
    deny: { id: BannerAnswer; title: string }
  }
}
