//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.surface.sunken },
  frame: { flex: 1, overflow: 'hidden' },
  picture: { width: '100%', height: '100%' },
  close: { position: 'absolute', right: theme.spacing.md },
}))
