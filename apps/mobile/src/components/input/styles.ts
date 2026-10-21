//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  base: {
    ...theme.typography.body,
    minHeight: theme.control.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    // A hairline round it, so the box shows on a card of its own colour too.
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    backgroundColor: theme.surface.raised,
    color: theme.text.heading,
  },
  mono: {
    ...theme.typography.mono,
    textAlignVertical: 'top',
  },
  bare: {
    minHeight: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: theme.surface.clear,
    textAlignVertical: 'top',
  },
  disabled: { opacity: 0.6 },
}))
