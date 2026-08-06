import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [react(), svgr(), tailwindcss()],
  // Fixed port so the Electron shell's dev server URL (SOROMI_DEV) always matches.
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
      // The bare package resolves to the barrel; any subpath (`@soromi/ui/lib/utils`,
      // `@soromi/ui/components/ui/*`) resolves under `src/`, so shadcn/AI-Elements' generated
      // internal imports work when the app bundles the ui source.
      '@soromi/ui': fileURLToPath(new URL('../ui/src', import.meta.url)),
    },
  },
})
