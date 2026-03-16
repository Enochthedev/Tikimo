import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(__dirname, 'src/web/map'),
  build: {
    outDir: resolve(__dirname, 'src/web/map/dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '../../core/types/response.js': resolve(__dirname, 'src/core/types/response.ts'),
    },
  },
})
