//Type
import type { Theme } from '@/config/theme'
import type { PageMessage } from './types'

/** The page with the app's colours and type size written in. */
export const fillPage = (page: string, theme: Theme, fontSize: number): string =>
  page
    .replaceAll('__BACKGROUND__', theme.surface.page)
    .replaceAll('__FOREGROUND__', theme.text.heading)
    .replaceAll('__FONT_SIZE__', String(fontSize))

/**
 * A call to one of the page's functions, as script for the web view to run. The arguments go in
 * as JSON, which is how terminal output (any characters at all) crosses over intact.
 */
export const call = (name: string, ...args: unknown[]): string =>
  `window.__terminal&&window.__terminal.${name}(${args.map((arg) => JSON.stringify(arg)).join(',')});true;`

/** What the page said, or `null` for anything that is not one of its messages. */
export const parseMessage = (data: string): PageMessage | null => {
  try {
    const message: unknown = JSON.parse(data)
    if (typeof message !== 'object' || message === null) return null
    const value = message as Record<string, unknown>
    if (value.type === 'ready') return { type: 'ready' }
    if (value.type === 'input' && typeof value.data === 'string') {
      return { type: 'input', data: value.data }
    }
    if (value.type === 'size' && typeof value.cols === 'number' && typeof value.rows === 'number') {
      return { type: 'size', cols: value.cols, rows: value.rows }
    }

    return null
  } catch {
    return null
  }
}
