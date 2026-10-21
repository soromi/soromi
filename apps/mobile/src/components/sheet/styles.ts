//Config
import { layout } from '@/config/layout'
import { defineStyles } from '@/config/theme'

export const makeStyles = defineStyles((theme) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.surface.scrim,
  },
  card: {
    // Never the whole screen: some of what is behind stays in view, and stays tappable to leave.
    maxHeight: '75%',
    // Nor the whole width of a wide one, where it sits in the middle.
    alignSelf: 'center',
    width: '100%',
    maxWidth: layout.sheet,
    paddingTop: theme.spacing.sm,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    backgroundColor: theme.surface.raised,
  },
  grip: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.border.default,
  },
  title: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm2,
    paddingBottom: theme.spacing.sm,
  },
}))
