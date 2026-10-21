//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  root: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.lg,
    // A hairline round it, so it shows on a card of its own colour too.
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    backgroundColor: theme.surface.raised,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  active: { backgroundColor: theme.surface.active },
}))
