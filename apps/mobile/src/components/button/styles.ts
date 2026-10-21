//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
  },
  sm: {
    minHeight: theme.control.sm,
    paddingHorizontal: theme.spacing.sm2,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  md: {
    minHeight: theme.control.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  primary: { backgroundColor: theme.surface.action },
  secondary: { backgroundColor: theme.surface.active },
  warn: { backgroundColor: theme.surface.warn },
  plain: { paddingHorizontal: 0, paddingVertical: 0 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
}))
