//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles(() => ({
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  art: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
}))
