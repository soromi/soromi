//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    minHeight: theme.control.md,
    paddingHorizontal: theme.spacing.md,
  },
  label: { flex: 1 },
  pressed: { backgroundColor: theme.surface.active },
  disabled: { opacity: 0.5 },
}))
