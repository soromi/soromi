export const config = {
  /** Listen port (all interfaces). */
  port: Number(process.env.PORT ?? 8787),
  /**
   * Shared secret a peer must present (the `x-soromi-access` header) to CREATE a room. Only the
   * daemon holds it; a phone joins an existing room by id without it. `RELAY_ACCESS_KEY` overrides
   * the default (which lets public builds connect); set it to gate a self-hosted relay. Empty
   * disables the gate entirely (anyone may create rooms).
   */
  accessKey: process.env.RELAY_ACCESS_KEY ?? 'soromi',
  /** The header the daemon sends its access key in. */
  accessHeader: 'x-soromi-access',
  /** Two peers per room: the desktop daemon and one phone. A third is refused. */
  maxPeersPerRoom: 2,
  /** Largest frame the relay will forward; real frames are small terminal I/O / E2EE blobs. */
  maxFrameBytes: 4 * 1024 * 1024,
  /** Ping every peer this often; drop it if the previous ping went unanswered. */
  heartbeatMs: 30_000,
  /** Reject absurd room ids. */
  maxRoomIdLength: 128,
}
