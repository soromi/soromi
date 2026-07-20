import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import compression from 'compression'
import express from 'express'

const state = {
  // The app shell and service worker must revalidate every load so a new deploy is picked up.
  noCache: ['index.html', 'sw.js', 'registerSW.js'],
  dist: fileURLToPath(new URL('./dist', import.meta.url)),
  port: Number(process.env.PORT ?? 8080),
}

if (!existsSync(state.dist)) {
  console.error('dist/ is missing. Run `pnpm --filter @soromi/web build` first.')

  process.exit(1)
}

const app = express()

app.use(compression())

// Hashed assets never change under their name: cache them hard.
app.use('/assets', express.static(`${state.dist}/assets`, { immutable: true, maxAge: '1y' }))

app.use(
  express.static(state.dist, {
    setHeaders: (res, filePath) => {
      if (state.noCache.some((name) => filePath.endsWith(name))) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }),
)

// Single-page fallback: any unmatched route serves the shell (mirrors the PWA `navigateFallback`).
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(`${state.dist}/index.html`)
})

app.listen(state.port, () => {
  console.log(`Soromi web listening on :${state.port}`)
})
