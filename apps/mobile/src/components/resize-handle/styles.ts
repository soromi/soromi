//Config
import { defineStyles } from '@/config/theme'

//Constants
import { RESIZE_HANDLE } from './constants'

export const makeStyles = defineStyles((theme) => ({
  // Inside its column, on the edge: Android takes no touch outside a view's own bounds.
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: RESIZE_HANDLE.width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: { left: 0 },
  right: { right: 0 },
  grip: {
    width: 4,
    height: 40,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.border.default,
  },
  active: { backgroundColor: theme.surface.action },
}))
