//Config
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  // Android adds leading above and below the glyph box on top of the line height; without it text
  // sits where its line height says, on both platforms.
  base: { includeFontPadding: false },
  ...theme.typography,
}))

export const makeTones = defineStyles((theme) => ({
  heading: { color: theme.text.heading },
  body: { color: theme.text.body },
  muted: { color: theme.text.muted },
  action: { color: theme.text.action },
  onAction: { color: theme.text.onAction },
  onWarn: { color: theme.text.onWarn },
  danger: { color: theme.text.danger },
  warn: { color: theme.text.warn },
  info: { color: theme.text.info },
}))
