// Runs inside the terminal's web view, next to xterm. It is the page's half of the bridge to the
// app: the app calls the functions on `window.__terminal`, and hears back through messages.
//
// This file is not part of the app's bundle. `pnpm gen:terminal` puts it, with xterm, into
// `src/components/terminal/page.generated.ts`, which is what the app loads.
{
  const BASE = __FONT_SIZE__
  const SMALLEST = 6

  const container = document.getElementById('terminal')
  const term = new Terminal({
    fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSize: BASE,
    cursorBlink: true,
    allowProposedApi: true,
    // The daemon keeps the real history; this is only how far back this view can scroll.
    scrollback: 1000,
    theme: { background: '__BACKGROUND__', foreground: '__FOREGROUND__' },
  })
  const fit = new FitAddon.FitAddon()
  term.loadAddon(fit)
  // Unicode 11 widths, so column counting matches modern CLIs.
  term.loadAddon(new Unicode11Addon.Unicode11Addon())
  term.unicode.activeVersion = '11'
  term.open(container)

  // Whether this phone drives the terminal (types into it, decides its size) or only watches.
  let driving = false
  // The size the daemon says the terminal is, which a watching phone follows.
  let told = null

  const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message))

  // Driving: the terminal is as large as fits the screen, and the daemon is told.
  const claim = () => {
    if (!driving || container.clientWidth === 0 || container.clientHeight === 0) return
    term.options.fontSize = BASE
    try {
      fit.fit()
    } catch {
      // Not laid out yet; the next change of size tries again.
      return
    }
    post({ type: 'size', cols: term.cols, rows: term.rows })
  }

  // Watching: the terminal is the size it is told, drawn as large as its columns allow. Output is
  // laid out for that size, so anything else would scramble it.
  const follow = () => {
    if (driving || !told || container.clientWidth === 0) return
    term.options.fontSize = BASE
    const fits = fit.proposeDimensions()
    if (fits && fits.cols < told.cols) {
      term.options.fontSize = Math.max(SMALLEST, Math.floor((BASE * fits.cols) / told.cols))
    }
    if (term.cols !== told.cols || term.rows !== told.rows) term.resize(told.cols, told.rows)
  }

  const layout = () => (driving ? claim() : follow())

  term.onData((data) => {
    if (driving) post({ type: 'input', data })
  })
  new ResizeObserver(layout).observe(container)

  window.__terminal = {
    write: (data) => term.write(data),
    reset: () => term.reset(),
    drive: (on) => {
      driving = on
      term.options.disableStdin = !on
      layout()
    },
    // Goes through the write queue, so the change lands between the output drawn for the old
    // size and the output drawn for the new.
    size: (cols, rows) => {
      told = { cols, rows }
      term.write('', follow)
    },
  }

  post({ type: 'ready' })
}
