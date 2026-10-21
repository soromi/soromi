//Type
import type { NotificationsConfig } from './notifications.type'

export const NOTIFICATIONS: NotificationsConfig = {
  channel: { id: 'sessions', name: 'Sessions' },
  general: 'soromi',
  task: 'soromi.answer',
  // The same name the computer pushes them under (its `APPROVAL_CATEGORY`).
  approval: {
    category: 'approval',
    allow: { id: 'allow', title: 'Allow' },
    deny: { id: 'deny', title: 'Deny' },
  },
}
