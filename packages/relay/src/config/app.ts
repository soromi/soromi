export const config = {
  /** Listen port (all interfaces). */
  port: Number(process.env.PORT ?? 8787),
  /** The header the daemon sends its access key in. */
  accessHeader: 'x-soromi-access',
  /** Largest frame the relay will forward; real frames are small terminal I/O / E2EE blobs. */
  maxFrameBytes: 4 * 1024 * 1024,
  /**
   * How much may wait to be written to one peer. A peer further behind than this is not draining
   * its socket; it is dropped so it reconnects and starts from a fresh snapshot, and so the relay
   * does not buffer for it without bound.
   */
  maxBufferedBytes: 8 * 1024 * 1024,
  /** Ping every peer this often; drop it if the previous ping went unanswered. */
  heartbeatMs: 30_000,
  /** Reject absurd room ids. */
  maxRoomIdLength: 128,
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
