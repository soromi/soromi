import { createElement } from 'react'
import { Platform } from 'react-native'

//Components
import { HeaderTitle } from './components/header-title'

//Type
import type { ReactElement } from 'react'
import type { HeaderActions, HeaderTitleOptions } from './types'

/**
 * A screen's options for its title.
 *
 * Android's toolbar sets a title well to the right of the back arrow (Material's 72 dp keyline),
 * in a large type of its own. It only lets go of that space when its own title is empty, so there
 * the title is drawn by the app instead, in the app's type, next to the arrow. iOS sets its title
 * as the system does everywhere else, and keeps it.
 */
export const getHeaderTitle = (title: string): HeaderTitleOptions => {
  if (Platform.OS !== 'android') return { title }

  return { title: '', headerTitle: () => createElement(HeaderTitle, { title }) }
}

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
