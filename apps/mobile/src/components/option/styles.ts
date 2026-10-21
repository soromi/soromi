//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm2,
  },
  text: { flex: 1, gap: theme.spacing.xxs },
  pressed: { backgroundColor: theme.surface.active },
  disabled: { opacity: 0.5 },
}))
