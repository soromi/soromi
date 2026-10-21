import { Platform } from 'react-native'

//Type
import type { ReactElement } from 'react'
import type { HeaderActions } from './types'

/**
 * A screen's options for what sits at the right of its header.
 *
 * iOS (from 26) puts whatever is placed in a navigation bar on a pane of glass of its own, and
 * stretches that pane from one screen's buttons to the next as screens change: right for the
 * system's own buttons, wrong for ours, which are drawn in the app's style and looked like a white
 * capsule sweeping across the header. There the same element is handed over as a bar item that
 * asks for no such background. Android has no such thing, and takes the element as it is.
 */
export const getHeaderActions = (render: () => ReactElement | null): HeaderActions => {
  if (Platform.OS !== 'ios') return { headerRight: render }

  return {
    headerRight: render,
    unstable_headerRightItems: () => {
      const element = render()

      return element ? [{ type: 'custom', element, hidesSharedBackground: true }] : []
    },
  }
}
