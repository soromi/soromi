//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  dot: { width: 9, height: 9, borderRadius: theme.borderRadius.round },
  thinking: { backgroundColor: theme.status.thinking },
  'waiting-input': { backgroundColor: theme.status['waiting-input'] },
  blocked: { backgroundColor: theme.status.blocked },
  done: { backgroundColor: theme.status.done },
  idle: { backgroundColor: theme.status.idle },
}))
