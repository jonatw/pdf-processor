// vite.config.js
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/pdf-processor/',
  root: resolve(__dirname, '.'),
  build: {
    minify: 'esbuild', // Use esbuild for minification (default)
    esbuild: {
      drop: ['console', 'debugger'], // Remove all console.* and debugger statements
    },
    sourcemap: false, // Disable source maps in production
  },
})
