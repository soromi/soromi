//Type
import type { ConversationsConfig } from '../types'

export const CONVERSATIONS: ConversationsConfig = {
  title: 'Earlier conversations',
  search: 'Search what was said…',
  hint: 'Pick one to carry it on in a new session, its history and all.',
  searching: 'Searching…',
  loading: 'Looking for this workspace’s conversations…',
  offline: 'Your computer is not reachable right now.',
  empty: 'No earlier conversations in this workspace yet.',
  none: 'No conversation here mentions',
  found: { one: '1 conversation mentions', many: 'mention', limit: 'newest that mention' },
  limit: 50,
  open: 'Open in a session',
  mode: 'chat',
}
