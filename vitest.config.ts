import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@soromi/protocol': resolve(__dirname, 'packages/protocol/src/index.ts'),
      '@soromi/core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
})
