import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// The app's pure logic (parsers, helpers) is tested here, apart from the repo's own run: the app
// installs on its own, so its dependencies are only present in this folder.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
