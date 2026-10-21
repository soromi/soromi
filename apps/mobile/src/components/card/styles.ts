//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  card: {
    overflow: 'hidden',
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.surface.raised,
  },
  divided: {
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.border.default,
  },
}))
