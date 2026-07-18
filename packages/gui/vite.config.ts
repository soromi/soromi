import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [react(), svgr()],
  // Fixed port so the Tauri shell's devUrl always matches.
  server: {
    port: 1420,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@soromi/client': fileURLToPath(new URL('../client/src/index.ts', import.meta.url)),
      // Shared subpaths (specific paths listed before the package root so they win the match).
      '@soromi/ui/theme.css': fileURLToPath(new URL('../ui/src/theme.css', import.meta.url)),
      '@soromi/ui/code-viewer': fileURLToPath(
        new URL('../ui/src/files/code-viewer.tsx', import.meta.url),
      ),
      '@soromi/ui': fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
    },
  },
})
