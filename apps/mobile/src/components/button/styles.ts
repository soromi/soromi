//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
  },
  sm: {
    paddingHorizontal: theme.spacing.sm2,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  md: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  primary: { backgroundColor: theme.surface.action },
  secondary: { backgroundColor: theme.surface.active },
  warn: { backgroundColor: theme.surface.warn },
  plain: { paddingHorizontal: 0, paddingVertical: 0 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
}))
