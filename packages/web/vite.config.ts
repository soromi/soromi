import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [react(), svgr()],
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
