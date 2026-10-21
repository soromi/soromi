//Types
import type { ChatCursor, ChatEvent, ChatFile } from '@soromi/protocol'

/**
 * The chat events held for a session and how far they go. The events are a contiguous run of the
 * daemon's log that ends at `cursor.seq`: earlier pages are added at the front, new events at the
 * end. So the place of any event held follows from where it sits in the array.
 */
export interface ChatLog {
  events: ChatEvent[]
  cursor?: ChatCursor
}

/**
 * Adds events the daemon sent to the end of the log. `seq` is the place of the last one. Events
 * already held (the daemon sent them twice, on either side of a catch-up) are left out.
 */
export function appendEvents(log: ChatLog, incoming: ChatEvent[], seq: number): ChatLog {
  const { cursor } = log
  // Without a cursor nothing says where these belong; a reset always comes first.
  if (!cursor || seq <= cursor.seq) return log
  const first = seq - incoming.length + 1
  const fresh = incoming.slice(Math.max(0, cursor.seq - first + 1))

  return { events: [...log.events, ...fresh], cursor: { log: cursor.log, seq } }
}

/** Where in `log.events` the event numbered `seq` sits, or -1 if it is not held. */
function indexOf(log: ChatLog, seq: number): number {
  if (!log.cursor) return -1
  const index = log.events.length - 1 - (log.cursor.seq - seq)

  return index >= 0 && index < log.events.length ? index : -1
}

/** A file whose bytes were left out of its chat event, by the place of the event and its index. */
export interface DeferredFile {
  seq: number
  index: number
}

/** The events that carry files: a prompt's attachments, the pictures a tool returned. */
type WithFiles = Extract<ChatEvent, { kind: 'user' | 'tool-result' }>

const hasFiles = (event: ChatEvent | undefined): event is WithFiles =>
  event?.kind === 'user' || event?.kind === 'tool-result'

/** Every attached file in the log still waiting for its bytes. */
export function deferredFiles(log: ChatLog): DeferredFile[] {
  const { cursor } = log
  if (!cursor) return []
  const waiting: DeferredFile[] = []
  log.events.forEach((event, at) => {
    if (!hasFiles(event)) return
    const seq = cursor.seq - (log.events.length - 1 - at)
    event.files?.forEach((file, index) => {
      if (file.deferred) waiting.push({ seq, index })
    })
  })

  return waiting
}

/**
 * Puts a fetched file in place of its stub. Returns the same events if the file is for another run
 * of the log, or for an event no longer held.
 */
export function withFile(
  log: ChatLog,
  run: string,
  seq: number,
  index: number,
  file: ChatFile,
): ChatEvent[] {
  if (log.cursor?.log !== run) return log.events
  const at = indexOf(log, seq)
  const event = log.events[at]
  if (!hasFiles(event) || !event.files?.[index]) return log.events

  const files = event.files.map((held, i) => (i === index ? file : held))
  const events = [...log.events]
  events[at] = { ...event, files }

  return events
}
