//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  mark: { gap: theme.spacing.xxs, justifyContent: 'center' },
  bar: {
    height: 2,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.surface.action,
  },
}))
