import { defineConfig, devices } from '@playwright/test';

// BASE_URL can be set to a CF preview URL for agent-driven UAT:
//   BASE_URL=https://fix-foo.pdf-processor-41c.pages.dev npx playwright test
// Defaults to the vite preview server for CI.
const baseURL = process.env.BASE_URL || 'http://localhost:4173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,        // Pyodide first-load can take 90s+ (80MB WASM)
  retries: 0,
  workers: 1,              // Sequential — avoids WASM OOM under parallel load
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Start vite preview before tests if running against localhost (CI mode)
  ...(baseURL.includes('localhost') && {
    webServer: {
      command: 'npm run preview',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  }),
});
