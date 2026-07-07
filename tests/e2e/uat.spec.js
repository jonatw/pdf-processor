// End-to-end UAT: verifies the full Pyodide/micropip/PDF-processing browser path.
// Runs against vite preview (localhost) in CI, or against a CF preview URL in production.
// Covers the bug class: missing self-hosted wheels silently replaced by SPA-fallback HTML.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Minimal 1-page PDF — valid structure, no watermarks, smoke test fixture.
const MINIMAL_PDF = readFileSync(resolve(__dirname, 'fixtures/minimal.pdf'));

// Wheel paths that must NOT return text/html (Cloudflare SPA-fallback footgun)
const WHEEL_PATHS = [
  '/pyodide/micropip-0.11.1-py3-none-any.whl',
  '/wheels/pymupdf-1.27.1-cp314-none-pyemscripten_2026_0_wasm32.whl',
];

// Core Pyodide assets that must be served with correct MIME types
const PYODIDE_ASSETS = [
  { path: '/pyodide/pyodide.mjs',        type: 'application/javascript' },
  { path: '/pyodide/pyodide.asm.wasm',   type: 'application/wasm' },
  { path: '/pyodide/pyodide-lock.json',  type: 'application/json' },
];

test.describe('PDF Processor UAT', () => {

  test('no cross-origin requests during initialization', async ({ page }) => {
    const crossOriginRequests = [];
    page.on('request', req => {
      const url = new URL(req.url());
      const baseUrl = new URL(page.url() || 'http://localhost');
      if (url.origin !== 'about:' && url.origin !== baseUrl.origin && !url.hostname.includes('localhost')) {
        crossOriginRequests.push(req.url());
      }
    });

    await page.goto('/');
    // Wait for Pyodide init — use waitForFunction to avoid visibility race with
    // the CSS fade-out that hides #init-status after Ready is logged.
    await page.waitForFunction(
      () => document.getElementById('status-log')?.textContent?.includes('Ready'),
      { timeout: 120_000 }
    );

    expect(crossOriginRequests).toEqual([]);
  });

  test('wheel assets served as binary (not text/html SPA-fallback)', async ({ page }) => {
    for (const path of WHEEL_PATHS) {
      const response = await page.request.get(path);
      expect(response.status(), `${path} should return 200`).toBe(200);
      const contentType = response.headers()['content-type'] ?? '';
      expect(contentType, `${path} must not be text/html (SPA fallback)`).not.toContain('text/html');
    }
  });

  test('core Pyodide assets served with correct MIME types', async ({ page }) => {
    for (const { path, type } of PYODIDE_ASSETS) {
      const response = await page.request.get(path);
      expect(response.status(), `${path} should return 200`).toBe(200);
      const contentType = response.headers()['content-type'] ?? '';
      expect(contentType, `${path} content-type`).toContain(type);
    }
  });

  test('Pyodide reaches Ready state', async ({ page }) => {
    await page.goto('/');
    // waitForFunction avoids visibility race — #status-log fades out via CSS
    // animation after Ready is logged; toContainText would timeout if animation
    // completes before Playwright asserts.
    await page.waitForFunction(
      () => document.getElementById('status-log')?.textContent?.includes('Ready'),
      { timeout: 120_000 }
    );
    const uploadSection = page.locator('#upload-section');
    await expect(uploadSection).not.toHaveClass(/hidden/);
  });

  test('PDF upload and processing completes without error', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status-log')).toContainText('Ready', { timeout: 120_000 });

    // Upload the minimal test PDF via the hidden file input
    await page.locator('#pdf-upload').setInputFiles({
      name: 'test-smoke.pdf',
      mimeType: 'application/pdf',
      buffer: MINIMAL_PDF,
    });

    // Process button should become enabled
    const processBtn = page.locator('#process-btn');
    await expect(processBtn).not.toBeDisabled({ timeout: 5_000 });
    await processBtn.click();

    // Wait for the download link — confirms processing completed successfully
    // (.not.toBeEmpty would fire on the spinner alone, before the final state)
    const resultsList = page.locator('#results-list');
    await expect(resultsList.locator('.download-btn')).toBeVisible({ timeout: 60_000 });

    // No init error overlay
    await expect(page.locator('#init-error')).not.toBeVisible();

    // No per-file error item (class added by updateResultItem on error path)
    await expect(resultsList.locator('.result-item.error')).toHaveCount(0);
  });

});
