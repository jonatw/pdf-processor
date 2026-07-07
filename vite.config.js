// vite.config.js
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { execSync } from 'child_process'

const gitHash = execSync('git rev-parse --short HEAD').toString().trim()

export default defineConfig({
  base: '/pdf-processor/',
  root: resolve(__dirname, '.'),
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler', // legacy JS API is removed in Dart Sass 2.0 (sass-lang.com/d/legacy-js-api)
      },
    },
  },
  build: {
    minify: 'esbuild', // Use esbuild for minification (default)
    esbuild: {
      drop: ['console', 'debugger'], // Remove all console.* and debugger statements
    },
    sourcemap: false, // Disable source maps in production
  },
})
