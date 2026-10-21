//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  filled: { backgroundColor: theme.surface.active },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
}))
