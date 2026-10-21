/**
 * Answers an upgrade with a socket that closes at once with `code`: a close code only reaches a
 * peer over a WebSocket, so one is opened to say it.
 */
export function refuse(code: number, reason: string): Response {
  const [client, server] = Object.values(new WebSocketPair())
  server.accept()
  server.close(code, reason)

  return new Response(null, { status: 101, webSocket: client })
}
