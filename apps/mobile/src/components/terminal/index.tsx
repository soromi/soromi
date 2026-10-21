import { useCallback, useEffect, useMemo, useRef } from 'react'
import { WebView } from 'react-native-webview'

//Config
import { useTheme, useThemedStyles } from '@/config/theme'

//Constants
import { TERMINAL } from './constants'

//Helpers
import { call, fillPage, parseMessage } from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { WebViewMessageEvent } from 'react-native-webview'
import type { Props, TerminalHandle } from './types'

//Assets
import { TERMINAL_PAGE } from './page.generated'

/**
 * A terminal on screen: the same emulator the desktop draws with, running in a web view, since it
 * needs a browser to run in. The app writes a session's output into it and hears what is typed;
 * this is the only place that imports the web view.
 *
 * Output is gathered for a frame before it is handed over, so a burst of small pieces costs one
 * crossing into the page, not one each.
 */
export const Terminal = (props: Props) => {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const view = useRef<WebView>(null)
  const ready = useRef(false)
  const pending = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const terminalRef = props.terminalRef
  const driving = props.driving
  const onReady = props.onReady
  const onInput = props.onInput
  const onSize = props.onSize

  const source = useMemo(
    () => ({ html: fillPage(TERMINAL_PAGE, theme, TERMINAL.fontSize) }),
    [theme],
  )

  const run = useCallback((script: string) => view.current?.injectJavaScript(script), [])

  const flush = useCallback(() => {
    timer.current = null
    if (!ready.current || pending.current === '') return
    const data = pending.current
    pending.current = ''
    run(call('write', data))
  }, [run])

  // What the app holds of the terminal. Output that arrives before the page is ready waits.
  const handle = useMemo<TerminalHandle>(
    () => ({
      write: (data) => {
        pending.current += data
        if (timer.current === null) timer.current = setTimeout(flush, TERMINAL.flushMs)
      },
      reset: () => {
        pending.current = ''
        run(call('reset'))
      },
      size: (cols, rows) => run(call('size', cols, rows)),
    }),
    [flush, run],
  )

  useEffect(() => {
    terminalRef.current = handle

    return () => {
      terminalRef.current = null
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [terminalRef, handle])

  // Who drives can change while the terminal is up: another device takes over, or hands back.
  useEffect(() => {
    if (ready.current) run(call('drive', driving))
  }, [driving, run])

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseMessage(event.nativeEvent.data)
      if (!message) return
      if (message.type === 'ready') {
        ready.current = true
        run(call('drive', driving))
        onReady()
        flush()
      } else if (message.type === 'input') {
        onInput(message.data)
      } else {
        onSize(message.cols, message.rows)
      }
    },
    [driving, run, flush, onReady, onInput, onSize],
  )

  return (
    <WebView
      ref={view}
      originWhitelist={TERMINAL.origin}
      source={source}
      style={styles.view}
      // The page scrolls its own scrollback; the web view itself has nowhere to go.
      scrollEnabled={false}
      overScrollMode="never"
      bounces={false}
      // The keyboard comes up when the terminal is tapped, with no bar of its own above it.
      keyboardDisplayRequiresUserAction={false}
      hideKeyboardAccessoryView
      onMessage={handleMessage}
    />
  )
}
