//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  base: {
    ...theme.typography.body,
    paddingHorizontal: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.surface.raised,
    color: theme.text.heading,
  },
  mono: {
    ...theme.typography.mono,
    textAlignVertical: 'top',
  },
  bare: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: theme.surface.clear,
    textAlignVertical: 'top',
  },
  disabled: { opacity: 0.6 },
}))
