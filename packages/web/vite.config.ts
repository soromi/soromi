import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    // Installable PWA: precache the built app shell for offline launch, auto-update the service
    // worker on new deploys. Uses the hand-written public/manifest.webmanifest (already linked in
    // index.html), so this only owns the service worker.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: {
    port: 1430,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Resolve the engine package to its source, so Vite transforms it as first-party code.
      '@soromi/client': fileURLToPath(new URL('../client/src/index.ts', import.meta.url)),
    },
  },
})
