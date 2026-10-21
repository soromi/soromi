//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.round,
  },
  sm: { width: 24, height: 24 },
  md: { width: 34, height: 34 },
  plain: {},
  primary: { backgroundColor: theme.surface.action },
  secondary: { backgroundColor: theme.surface.active },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
}))
