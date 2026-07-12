export const config = {
  /** Listen port (all interfaces). */
  port: Number(process.env.PORT ?? 8787),
  /** Two peers per room: the desktop daemon and one phone. A third is refused. */
  maxPeersPerRoom: 2,
  /** Largest frame the relay will forward; real frames are small terminal I/O / E2EE blobs. */
  maxFrameBytes: 4 * 1024 * 1024,
  /** Ping every peer this often; drop it if the previous ping went unanswered. */
  heartbeatMs: 30_000,
  /** Reject absurd room ids. */
  maxRoomIdLength: 128,
}
