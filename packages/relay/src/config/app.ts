export const config = {
  /** The header the daemon sends its access key in. */
  accessHeader: 'x-soromi-access',
  /** Reject absurd room ids. */
  maxRoomIdLength: 128,
  /** How the Worker tells a room which role a peer joins in, once it has decided. */
  roleHeader: 'x-soromi-role',
}

/** Close codes the relay sends, so a peer can tell why it was turned away. */
export const closeCode = {
  /** No room id, or an unusable one. */
  missingRoom: 4000,
  /** Another socket joined the room in the same role and took this one's place. */
  replaced: 4002,
  /** A host did not present the access key. */
  unauthorized: 4003,
  /** A device asked for a room with no host in it. */
  noHost: 4004,
}
