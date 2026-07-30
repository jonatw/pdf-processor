// vite.config.js
import { defineConfig } from 'vite'
import { execSync } from 'child_process'

const gitHash = execSync('git rev-parse --short HEAD').toString().trim()

export default defineConfig({
  base: '/pdf-processor/',
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
    // Vite 8 default minifier (Oxc/Rolldown). Drop options moved from
    // esbuild.drop to rolldownOptions.output.minify.compress per
    // https://vite.dev/guide/migration.html
    rolldownOptions: {
      output: {
        minify: {
          compress: {
            dropConsole: true, // Remove all console.* statements
            dropDebugger: true, // Remove all debugger statements
          },
        },
      },
    },
    sourcemap: false, // Disable source maps in production
  },
})
